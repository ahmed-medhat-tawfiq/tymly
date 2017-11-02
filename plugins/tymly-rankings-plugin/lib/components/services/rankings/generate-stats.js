'use strict'

const _ = require('lodash')
const stats = require('stats-lite')

module.exports = function generateStats (options) {
  return new Promise(
    (resolve, reject) => {
      console.log(options.category)
      let scores = []
      let ranges

      // Get the scores to perform statistics on
      options.client.query(getScoresSQL(options), function (err, result) {
        if (err) return reject(err)
        result.rows.map(r => scores.push(r.risk_score))

        const mean = stats.mean(scores)
        const stdev = stats.stdev(scores)

        if (scores.length > 0) {
          ranges = generateRanges(scores, mean, stdev)

          // Get rows from view
          options.client.query(getViewRowsSQL(options), function (err, res) {
            if (err) return reject(err)

            res.rows.map(r => {
              // Find range based on r.risk_score
              let range = findRange(ranges, r.risk_score)

              // Upsert range for this property with uprn
              options.client.query(updateRangeSQL(options, range, r), function (err) {
                if (err) reject(err)
                // Create statistics table (if not exists) and upsert row for statistic of this category
                options.client.query(generateStatsSQL(options, scores, mean, stdev), function (err) {
                  if (err) return reject(err)
                  resolve()
                })
              })
            })
          })
        }
      })
    }
  )
}

function generateRanges (scores, mean, stdev) {
  if (scores.length > 10000) {
    return {
      veryLow: {
        lowerBound: 0,
        upperBound: (+mean - (2 * +stdev)).toFixed(2)
      },
      low: {
        lowerBound: (+mean - (2 * +stdev) + +0.01).toFixed(2),
        upperBound: (+mean - +stdev).toFixed(2)
      },
      medium: {
        lowerBound: (+mean - +stdev + +0.01).toFixed(2),
        upperBound: (+mean + +stdev).toFixed(2)
      },
      high: {
        lowerBound: (+mean + +stdev + +0.01).toFixed(2),
        upperBound: (+mean + (2 * +stdev)).toFixed(2)
      },
      veryHigh: {
        lowerBound: (+mean + (2 * +stdev) + +0.01).toFixed(2),
        upperBound: Math.max(...scores)
      }
    }
  } else {
    return {
      low: {
        lowerBound: 0,
        upperBound: (+mean - +stdev).toFixed(2)
      },
      medium: {
        lowerBound: (+mean - +stdev + +0.01).toFixed(2),
        upperBound: (+mean + +stdev).toFixed(2)
      },
      high: {
        lowerBound: (+mean + +stdev + +0.01).toFixed(2),
        upperBound: Math.max(...scores)
      }
    }
  }
}

function findRange (ranges, score) {
  let range = null
  Object.keys(ranges).map(k => {
    if (score >= ranges[k].lowerBound && score <= ranges[k].upperBound) {
      range = k
    }
  })
  return range
}

function getScoresSQL (options) {
  // TODO: 'risk' in risk_score should be inferred
  return `SELECT risk_score FROM ${_.snakeCase(options.schema)}.${_.snakeCase(options.category)}_scores`
}

function getViewRowsSQL (options) {
  return `SELECT ${_.snakeCase(options.pk)}, risk_score FROM ${_.snakeCase(options.schema)}.${_.snakeCase(options.category)}_scores`
}

function updateRangeSQL (options, range, row) {
  return `CREATE TABLE IF NOT EXISTS ${_.snakeCase(options.schema)}.${_.snakeCase(options.pk)}_to_range 
  (${_.snakeCase(options.pk)} bigint not null primary key, range text);
  INSERT INTO ${_.snakeCase(options.schema)}.${_.snakeCase(options.pk)}_to_range (${_.snakeCase(options.pk)}, range)
  VALUES (${row[_.snakeCase(options.pk)]}, '${range}')
  ON CONFLICT (${_.snakeCase(options.pk)}) DO UPDATE SET
  range = '${range}';`
}

function generateStatsSQL (options, scores, mean, stdev) {
  return `CREATE TABLE IF NOT EXISTS ${_.snakeCase(options.schema)}.${_.snakeCase(options.name)}_stats
  (category text not null primary key, count numeric, mean numeric, median numeric, variance numeric, stdev numeric);
  INSERT INTO ${_.snakeCase(options.schema)}.${_.snakeCase(options.name)}_stats (category, count, mean, median, variance, stdev)
  VALUES ('${_.kebabCase(options.category)}', ${scores.length}, ${mean.toFixed(2)}, ${stats.median(scores).toFixed(2)},
  ${stats.variance(scores).toFixed(2)}, ${stdev.toFixed(2)})
  ON CONFLICT (category) DO UPDATE SET
  count = ${scores.length},
  mean = ${mean.toFixed(2)},
  median = ${stats.median(scores).toFixed(2)},
  variance = ${stats.variance(scores).toFixed(2)},
  stdev = ${stdev.toFixed(2)};
  `
}

'use strict'

const debug = require('debug')('tymly-pg-plugin')

const _ = require('lodash')
const schema = require('./schema.json')
const process = require('process')
const async = require('async')

const pg = require('pg')
const relationize = require('relationize')
const pgInfo = require('pg-info')
const pgDiffSync = require('pg-diff-sync')
const pgModel = require('pg-model')

const pgStatementRunner = require('./pg-statement-runner')
const generateUpsertStatement = require('./generate-upsert-statement')

class PostgresqlStorageService {
  boot (options, callback) {
    this.storageName = 'postgresql'

    this.models = {}

    const connectionString = process.env.PG_CONNECTION_STRING
    infoMessage(options.messages, `Using Postgresql storage... (${connectionString})`)

    // TODO: Use pool instead

    this.client = new pg.Client(connectionString)
    this.client.connect()

    const modelDefinitions = options.blueprintComponents.models || {}
    const seedData = options.blueprintComponents.seedData

    this.createModels(modelDefinitions, options.messages)
      .then(() => this.insertMultipleSeedData(seedData, options.messages))
      .then(() => callback())
      .catch(err => callback(err))
  } // boot

  async createModels (modelDefinitions, messages) {
    const schemaNames = _.uniq(_.map(modelDefinitions, function (modelDefinition) {
      return _.kebabCase(modelDefinition.namespace).replace(/-/g, '_')
    }))
    infoMessage(messages, `Getting info for from DB schemas: ${schemaNames.join(', ')}...`)
    const currentDbStructure = await pgInfo({
      client: this.client,
      schemas: schemaNames
    })

    const jsonSchemas = Object.values(modelDefinitions).map(
      definition => {
        return {
          namespace: definition.namespace,
          schema: definition
        }
      }
    ) // jsonSchemas
    const expectedDbStructure = await relationize({
      source: {
        schemas: jsonSchemas
      }
    })

    const rawStatements = pgDiffSync(
      currentDbStructure,
      expectedDbStructure
    )
    const statements = rawStatements.map(s => {
      return {
        'sql': s,
        'params': []
      }
    })

    await pgStatementRunner(
      this.client,
      statements
    )

    const models = pgModel({
      client: this.client,
      dbStructure: expectedDbStructure
    })

    this.models = {}
    infoMessage(messages, 'Models:')

    for (const [namespaceId, namespace] of Object.entries(models)) {
      for (const [modelId, model] of Object.entries(namespace)) {
        const id = `${namespaceId}_${modelId}`
        detailMessage(messages, id)
        this.models[id] = model
      } // for ...
    } // for ...
  } // _boot

  insertMultipleSeedData (seedDataArray, messages) {
    return new Promise((resolve, reject) => {
      this._insertMultipleSeedData(seedDataArray, messages, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  } // insertMultipleSeedData

  _insertMultipleSeedData (seedDataArray, messages, callback) {
    const _this = this
    if (seedDataArray) {
      callback(null)
      infoMessage(messages, 'Loading seed data:')
      async.eachSeries(
        seedDataArray,
        (seedData, cb) => {
          const name = seedData.namespace + '_' + seedData.name
          const model = _this.models[name]
          if (model) {
            detailMessage(messages, name)

            // generate upsert sql statement
            const sql = generateUpsertStatement(model, seedData)
            debug('load', name, 'seed-data sql: ', sql)

            // generate a single array of parameters which each
            // correspond with a placeholder in the upsert sql statement
            let params = []
            _.forEach(seedData.data, (row) => {
              params = params.concat(row)
            })
            debug('load', name, 'seed-data params: ', params)

            pgStatementRunner(
              _this.client,
              [{
                'sql': sql,
                'params': params
              }],
              function (err) {
                if (err) {
                  cb(err)
                } else {
                  cb(null)
                }
              }
            )
          } else {
            detailMessage(messages, `WARNING: seed data found for model ${name}, but no such model was found`)
            cb(null)
          }
        },
        (err) => {
          if (err) {
            callback(err)
          } else {
            callback(null)
          }
        })
    } else {
      callback(null)
    }
  } // insertMultipleSeedData
} // PostgresqlStorageService

function detailMessage (messages, msg) {
  if (!messages) {
    return
  }

  messages.detail(msg)
} // detailMessage

function infoMessage (messages, msg) {
  if (!messages) {
    return
  }

  messages.info(msg)
} // infoMessage

module.exports = {
  schema: schema,
  serviceClass: PostgresqlStorageService,
  refProperties: {
    modelId: 'models'
  }
}

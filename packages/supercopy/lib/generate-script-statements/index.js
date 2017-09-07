'use strict'

const addDeleteStatements = require('./add-delete-statements')
const addInsertStatements = require('./add-insert-statements')
const addUpdateStatements = require('./add-update-statements')
const addUpsertStatements = require('./add-upsert-statements')
const debug = require('debug')('supercopy')

module.exports = function generateScriptStatements (fileInfo, options) {
  const scriptStatements = ['BEGIN;']
  addDeleteStatements(scriptStatements, fileInfo, options)
  addInsertStatements(scriptStatements, fileInfo, options)
  addUpdateStatements(scriptStatements, fileInfo, options)
  addUpsertStatements(scriptStatements, fileInfo, options)
  scriptStatements.push('COMMIT;')

  debug(`Statements to run ${JSON.stringify(scriptStatements, null, 2)}`)

  return scriptStatements
}
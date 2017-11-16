/* eslint-env mocha */

'use strict'

const tymly = require('tymly')
const path = require('path')
const expect = require('chai').expect
const HlPgClient = require('hl-pg-client')
const sqlScriptRunner = require('./fixtures/sql-script-runner.js')

const GET_USER_REMIT_STATE_MACHINE = 'tymly_getUserRemit_1_0'

describe('user-remit tymly-users-plugin tests', function () {
  this.timeout(5000)
  let statebox

  const pgConnectionString = process.env.PG_CONNECTION_STRING
  const client = new HlPgClient(pgConnectionString)

  it('should create some basic tymly services', function (done) {
    tymly.boot(
      {
        pluginPaths: [
          path.resolve(__dirname, './../lib'),
          require.resolve('tymly-pg-plugin')
        ]
      },
      function (err, tymlyServices) {
        expect(err).to.eql(null)
        statebox = tymlyServices.statebox
        done()
      }
    )
  })

  it('should create the settings test resources', function () {
    return sqlScriptRunner('./db-scripts/settings/setup.sql', client)
  })

  it('should create the favourites test resources', function () {
    return sqlScriptRunner('./db-scripts/favourites/setup.sql', client)
  })

  it('should start the state machine to get user remit', function (done) {
    statebox.startExecution(
      {
        clientManifest: {
          boardNames: ['wmfs_propertyViewer_1_0'],
          categoryNames: ['hr'],
          teamNames: ['socialClub'],
          todoExecutionNames: ['5200987c-bb03-11e7-abc4-cec278b6b50a'],
          formNames: ['wmfs_bookSomeoneSick_1_0', 'wmfs_createNewEmployee_1_0'],
          startable: ['wmfs_bookSomeoneSick_1_0']
        }
      },
      GET_USER_REMIT_STATE_MACHINE,
      {
        sendResponse: 'COMPLETE',
        userId: 'test-user'
      },
      function (err, executionDescription) {
        expect(err).to.eql(null)
        console.log(JSON.stringify(executionDescription, null, 2))
        expect(executionDescription.currentStateName).to.eql('GetUserRemit')
        expect(executionDescription.currentResource).to.eql('module:getUserRemit')
        expect(executionDescription.stateMachineName).to.eql(GET_USER_REMIT_STATE_MACHINE)
        expect(executionDescription.status).to.eql('SUCCEEDED')
        done()
      }
    )
  })

  it('should tear down the settings test resources', function () {
    return sqlScriptRunner('./db-scripts/settings/cleanup.sql', client)
  })

  it('should tear down the favourites test resources', function () {
    return sqlScriptRunner('./db-scripts/favourites/cleanup.sql', client)
  })
})

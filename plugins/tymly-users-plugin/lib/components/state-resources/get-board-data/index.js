'use strict'

class GetBoardData {
  init (resourceConfig, env, callback) {
    this.models = env.bootedServices.storage.models
    this.modelName = resourceConfig.model
    callback(null)
  }

  run (event, context) {
    const model = this.models[`${context.stateMachineMeta.namespace}_${this.modelName}`]
    const where = {}

    Object.keys(event.boardKeys).map(k => {
      where[k] = {equals: event.boardKeys[k]}
    })

    model.findOne({where})
      .then(doc => context.sendTaskSuccess({data: doc, boardKeys: event.boardKeys}))
      .catch(err => context.sendTaskFailure({error: 'getBoardFail', cause: err}))
  }
}

module.exports = GetBoardData
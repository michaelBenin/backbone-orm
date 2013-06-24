util = require 'util'
Backbone = require 'backbone'
_ = require 'underscore'

Utils = require './utils'

MAX_CACHE_MS = 500 # TODO: determine the best amount

class Cache
  constructor: ->
    @store_by_url = {}

  find: (url, data) ->
    (return if _.isArray(data) then [] else null) unless model_store = @store_by_url[url] # no model store, nothing to find

    now = (new Date()).valueOf()
    return @_getOrInvalidateModel(model_store, data, now) unless _.isArray(data) # one

    # many
    results = []
    results.push(model) for item in data when (model = @_getOrInvalidateModel(model_store, item, now))
    return results

  findOrCreate: (url, data, model_type) ->
    (@store_by_url[url] = model_store = {}) unless model_store = @store_by_url[url]

    now = (new Date()).valueOf()
    unless _.isArray(data) # one
      return model if model = @_getOrInvalidateModel(model_store, data, now)
      return @_createModel(model_store, data, model_type, now)

    # many
    results = []
    for item in data
      if model = @_getOrInvalidateModel(item, now)
        results.push()
      else
        results.push(@_createModel(model_store, item, model_type, now))
    return results

  add: (url, models) ->
    (@store_by_url[url] = model_store = {}) unless model_store = @store_by_url[url]

    now = (new Date()).valueOf()
    return @_addModel(model_store, models, now) unless _.isArray(models) # one

    # many
    @_addModel(model_store, model, now) for model in models
    return @

  # alias
  update: Cache::add

  remove: (url, ids) ->
    if model_store = @store_by_url[url]
      if _.isArray(ids) # manya
        delete model_store[id] for id in ids
      else # one
        delete model_store[id]
    return @

  clear: (url, ids) ->
    (@store_by_url[url] = {}; return @)

  _createModel: (model_store, data, model_type, now) ->
    if _.isObject(data)
      return new model_type(data) unless data.id # no id, means just create without caching (embedded)
      @_addModel(model_store, model = new model_type(data), now)
    else
      @_addModel(model_store, model = new model_type({id: data}), now)
      model._orm_needs_load = true
    return model

  _addModel: (model_store, model, now) ->
    throw new Error "Cannot store a model without an id: #{util.inspect(model.attributes)}" unless model.attributes.id
    model_store[model.attributes.id] = {model: model, last_used: now}
    return @

  _getOrInvalidateModel: (model_store, data, now) ->
    id = Utils.dataId(data)
    return null unless model_info = model_store[id] # not found

    # too old
    (delete model_store[id]; return null) if (now - model_info.last_used) > MAX_CACHE_MS

    # update data, timestamp and return
    model = model_info.model
    if data instanceof Backbone.Model # TODO: is this needed?
      model.set(data.attributes)
    else if _.isObject(data)
      model.set(data)

    model_info.last_used = now
    return model

# singleton
module.exports = new Cache()
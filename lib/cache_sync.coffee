util = require 'util'
_ = require 'underscore'

CacheCursor = require './cache_cursor'
Schema = require './schema'
Utils = require './utils'

Cache = require './cache'

class CacheSync
  constructor: (@model_type, @wrapped_sync) ->
    throw new Error('Missing model_name for model') unless @model_type.model_name

    # publish methods and sync on model
    @model_type._sync = @
    @model_type._cache = Cache

    @fn = (method, model, options={}) =>
      @initialize()
      return module.exports.apply(null, Array::slice.call(arguments, 1)) if method is 'createSync' # create a new sync
      return @ if method is 'sync'
      @[method].apply(@, Array::slice.call(arguments, 1))

  initialize: ->
    return if @is_initialized; @is_initialized = true
    @wrapped_sync.initialize()

  read: (model, options) ->
    if model.models
      # cached_models = Cache.findAll(@model_type.model_name)
    else
      if (cached_model = Cache.find(@model_type.model_name, model.attributes.id)) # use cached
        # console.log "CACHE: read found #{@model_type.model_name} id: #{cached_model.get('id')}"
        return options.success(cached_model.toJSON())
    @wrapped_sync.fn 'read', model, options

  create: (model, options) ->
    @wrapped_sync.fn 'create', model, Utils.bbCallback (err, json) =>
      Cache.findOrCreate(@model_type.model_name, @model_type, json) # add to the cache

      return options.error(err) if err
      options.success(json)

  update: (model, options) ->
    if (cached_model = Cache.find(@model_type.model_name, model.attributes.id))
      # console.log "CACHE: update found #{@model_type.model_name} id: #{cached_model.get('id')}"
      cached_model.set(model.toJSON, options) if cached_model isnt model # update cache

    @wrapped_sync.fn 'update', model, Utils.bbCallback (err, json) =>
      return options.error(err) if err
      options.success(json)

  delete: (model, options) ->
    Cache.remove(@model_type.model_name, model.get('id')) # remove from the cache

    @wrapped_sync.fn 'delete', model, Utils.bbCallback (err, json) =>
      return options.error(err) if err
      options.success(json)

  ###################################
  # Backbone ORM - Class Extensions
  ###################################
  cursor: (query={}) -> return new CacheCursor(query, _.pick(@, ['model_type', 'wrapped_sync']))

  destroy: (query, callback) ->
    Cache.clear(@model_type.model_name) # TODO: optimize
    @wrapped_sync.destroy(query, callback)

  schema: (key) -> @model_type._schema
  relation: (key) -> @model_type._schema.relation(key)

module.exports = (model_type, wrapped_sync) ->
  sync = new CacheSync(model_type, wrapped_sync)
  return sync.fn
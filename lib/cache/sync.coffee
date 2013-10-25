_ = require 'underscore'

CacheCursor = require './cursor'
Schema = require '../schema'
Utils = require '../utils'
bbCallback = Utils.bbCallback

DEFAULT_LIMIT = 1000
DEFAULT_PARALLELISM = 100

# @private
class CacheSync
  constructor: (@model_type, @wrapped_sync_fn) ->

  initialize: ->
    return if @is_initialized; @is_initialized = true
    @wrapped_sync_fn('initialize')
    throw new Error('Missing model_name for model') unless @model_type.model_name

  read: (model, options) ->
    return options.success(cached_model.toJSON()) if not options.force and (cached_model = @model_type.cache.get(model.id)) # use cached
    @wrapped_sync_fn 'read', model, options

  create: (model, options) ->
    @wrapped_sync_fn 'create', model, bbCallback (err, json) =>
      return options.error(err) if err
      model.set({id: json.id})
      if cache_model = @model_type.cache.get(model.id)
        Utils.updateModel(cache_model, model) if cache_model isnt model
      else
        @model_type.cache.set(model.id, model)
      options.success(json)

  update: (model, options) ->
    @wrapped_sync_fn 'update', model, bbCallback (err, json) =>
      return options.error(err) if err
      if cache_model = @model_type.cache.get(model.id)
        Utils.updateModel(cache_model, model) if cache_model isnt model
      else
        @model_type.cache.set(model.id, model)
      options.success(json)

  delete: (model, options) ->
    @model_type.cache.destroy(model.id) # remove from the cache
    @wrapped_sync_fn 'delete', model, bbCallback (err, json) =>
      return options.error(err) if err
      options.success(json)

  ###################################
  # Backbone ORM - Class Extensions
  ###################################
  resetSchema: (options, callback) ->
    @model_type.cache.reset (err) =>
      return callback(err) if err
      @wrapped_sync_fn('resetSchema', options, callback)

  cursor: (query={}) -> return new CacheCursor(query, _.pick(@, ['model_type', 'wrapped_sync_fn']))

  destroy: (query, callback) ->
    # TODO: review for optimization
    @model_type.batch query, {$limit: DEFAULT_LIMIT, parallelism: DEFAULT_PARALLELISM}, callback, (model, callback) ->
      model.destroy bbCallback callback

  ###################################
  # Backbone Cache Sync - Custom Extensions
  ###################################
  connect: (url) ->
    @model_type.cache.reset()
    @wrapped_sync_fn('connect')

module.exports = (model_type, wrapped_sync_fn) ->
  sync = new CacheSync(model_type, wrapped_sync_fn)

  model_type::sync = sync_fn = (method, model, options={}) -> # save for access by model extensions
    sync.initialize()
    return wrapped_sync_fn.apply(null, arguments) if method is 'createSync' # create a new sync
    return sync if method is 'sync'
    return sync[method].apply(sync, Array::slice.call(arguments, 1)) if sync[method]
    return wrapped_sync_fn.apply(wrapped_sync_fn, Array::slice.call(arguments))

  return sync_fn

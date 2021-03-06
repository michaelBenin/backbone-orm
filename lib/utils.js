
/*
  backbone-orm.js 0.5.12
  Copyright (c) 2013 Vidigami - https://github.com/vidigami/backbone-orm
  License: MIT (http://www.opensource.org/licenses/mit-license.php)
  Dependencies: Backbone.js, Underscore.js, and Moment.js.
 */
var Backbone, DatabaseURL, JSONUtils, Queue, S4, URL, Utils, inflection, modelExtensions, _,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

URL = require('url');

DatabaseURL = require('./database_url');

Backbone = require('backbone');

_ = require('underscore');

inflection = require('inflection');

Queue = require('./queue');

JSONUtils = require('./json_utils');

modelExtensions = null;

S4 = function() {
  return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
};

module.exports = Utils = (function() {
  function Utils() {}

  Utils.resetSchemas = function(model_types, options, callback) {
    var failed_schemas, model_type, queue, _fn, _i, _j, _len, _len1, _ref;
    if (arguments.length === 2) {
      _ref = [{}, options], options = _ref[0], callback = _ref[1];
    }
    for (_i = 0, _len = model_types.length; _i < _len; _i++) {
      model_type = model_types[_i];
      model_type.schema();
    }
    failed_schemas = [];
    queue = new Queue(1);
    _fn = function(model_type) {
      return queue.defer(function(callback) {
        return model_type.resetSchema(options, function(err) {
          if (err) {
            failed_schemas.push(model_type.model_name);
            console.log("Error when dropping schema for " + model_type.model_name + ". " + err);
          }
          return callback();
        });
      });
    };
    for (_j = 0, _len1 = model_types.length; _j < _len1; _j++) {
      model_type = model_types[_j];
      _fn(model_type);
    }
    return queue.await(function(err) {
      if (options.verbose) {
        console.log("" + (model_types.length - failed_schemas.length) + " schemas dropped.");
      }
      if (failed_schemas.length) {
        return callback(new Error("Failed to migrate schemas: " + (failed_schemas.join(', '))));
      }
      return callback();
    });
  };

  Utils.guid = function() {
    return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
  };

  Utils.inspect = function(obj) {
    var err;
    try {
      return JSON.stringify(obj);
    } catch (_error) {
      err = _error;
      return "inspect: " + err;
    }
  };

  Utils.bbCallback = function(callback) {
    return {
      success: (function(model, resp, options) {
        return callback(null, model, resp, options);
      }),
      error: (function(model, resp, options) {
        return callback(resp || new Error('Backbone call failed'), model, resp, options);
      })
    };
  };

  Utils.wrapOptions = function(options, callback) {
    if (options == null) {
      options = {};
    }
    if (_.isFunction(options)) {
      options = Utils.bbCallback(options);
    }
    return _.defaults(Utils.bbCallback(function(err, model, resp, modified_options) {
      return callback(err, model, resp, options);
    }), options);
  };

  Utils.isModel = function(obj) {
    return obj && obj.attributes && ((obj instanceof Backbone.Model) || (obj.parse && obj.fetch));
  };

  Utils.isCollection = function(obj) {
    return obj && obj.models && ((obj instanceof Backbone.Collection) || (obj.reset && obj.fetch));
  };

  Utils.get = function(model, key, default_value) {
    model._orm || (model._orm = {});
    if (model._orm.hasOwnProperty(key)) {
      return model._orm[key];
    } else {
      return default_value;
    }
  };

  Utils.set = function(model, key, value) {
    model._orm || (model._orm = {});
    model._orm[key] = value;
    return model._orm[key];
  };

  Utils.orSet = function(model, key, value) {
    model._orm || (model._orm = {});
    if (!model._orm.hasOwnProperty(key)) {
      model._orm[key] = value;
    }
    return model._orm[key];
  };

  Utils.unset = function(model, key) {
    model._orm || (model._orm = {});
    return delete model._orm[key];
  };

  Utils.findOrGenerateModelName = function(model_type) {
    var model_name, url;
    if (model_type.prototype.model_name) {
      return model_type.prototype.model_name;
    }
    if (url = _.result(new model_type, 'url')) {
      if (model_name = (new DatabaseURL(url)).modelName()) {
        return model_name;
      }
    }
    if (model_type.name) {
      return model_type.name;
    }
    throw "Could not find or generate model name for " + model_type;
  };

  Utils.configureCollectionModelType = function(type, sync) {
    var ORMModel, modelURL, model_type;
    modelURL = function() {
      var url, url_parts;
      url = _.result(this.collection || type.prototype, 'url');
      if (!this.isNew()) {
        url_parts = URL.parse(url);
        url_parts.pathname = "" + url_parts.pathname + "/encodeURIComponent(@id)";
        url = URL.format(url_parts);
      }
      return url;
    };
    model_type = type.prototype.model;
    if (!model_type || (model_type === Backbone.Model)) {
      ORMModel = (function(_super) {
        __extends(ORMModel, _super);

        function ORMModel() {
          return ORMModel.__super__.constructor.apply(this, arguments);
        }

        ORMModel.prototype.url = modelURL;

        ORMModel.prototype.schema = type.prototype.schema;

        ORMModel.prototype.sync = sync(ORMModel);

        return ORMModel;

      })(Backbone.Model);
      return type.prototype.model = ORMModel;
    } else if (model_type.prototype.sync === Backbone.Model.prototype.sync) {
      model_type.prototype.url = modelURL;
      model_type.prototype.schema = type.prototype.schema;
      model_type.prototype.sync = sync(model_type);
    }
    return model_type;
  };

  Utils.configureModelType = function(type) {
    if (!modelExtensions) {
      modelExtensions = require('./extensions/model');
    }
    return modelExtensions(type);
  };

  Utils.patchRemoveByJSON = function(model_type, model_json, callback) {
    var key, queue, relation, schema, _fn, _i, _len;
    if (!(schema = model_type.schema())) {
      return callback();
    }
    queue = new Queue(1);
    _fn = function(relation) {
      return queue.defer(function(callback) {
        return relation.patchRemove(model_json, callback);
      });
    };
    for (relation = _i = 0, _len = schema.length; _i < _len; relation = ++_i) {
      key = schema[relation];
      _fn(relation);
    }
    return queue.await(callback);
  };

  Utils.presaveBelongsToRelationships = function(model, callback) {
    var key, queue, related_model, related_models, relation, schema, value, _fn, _i, _len, _ref;
    if (!model.schema) {
      return callback();
    }
    queue = new Queue(1);
    schema = model.schema();
    _ref = schema.relations;
    for (key in _ref) {
      relation = _ref[key];
      if (relation.type !== 'belongsTo' || relation.isVirtual() || !(value = model.get(key))) {
        continue;
      }
      related_models = value.models ? value.models : [value];
      _fn = (function(_this) {
        return function(related_model) {
          return queue.defer(function(callback) {
            return related_model.save(callback);
          });
        };
      })(this);
      for (_i = 0, _len = related_models.length; _i < _len; _i++) {
        related_model = related_models[_i];
        if (related_model.id) {
          continue;
        }
        _fn(related_model);
      }
    }
    return queue.await(callback);
  };

  Utils.dataId = function(data) {
    if (_.isObject(data)) {
      return data.id;
    } else {
      return data;
    }
  };

  Utils.dataIsSameModel = function(data1, data2) {
    if (Utils.dataId(data1) || Utils.dataId(data2)) {
      return Utils.dataId(data1) === Utils.dataId(data2);
    }
    return _.isEqual(data1, data2);
  };

  Utils.dataToModel = function(data, model_type) {
    var attributes, item, model;
    if (!data) {
      return null;
    }
    if (_.isArray(data)) {
      return (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = data.length; _i < _len; _i++) {
          item = data[_i];
          _results.push(Utils.dataToModel(item, model_type));
        }
        return _results;
      })();
    }
    if (Utils.isModel(data)) {
      model = data;
    } else if (Utils.dataId(data) !== data) {
      model = new model_type(model_type.prototype.parse(data));
    } else {
      (attributes = {})[model_type.prototype.idAttribute] = data;
      model = new model_type(attributes);
      model.setLoaded(false);
    }
    return model;
  };

  Utils.updateModel = function(model, data) {
    if (!data || (model === data) || data._orm_needs_load) {
      return model;
    }
    if (Utils.isModel(data)) {
      data = data.toJSON();
    }
    if (Utils.dataId(data) !== data) {
      model.setLoaded(true);
      model.set(data);
    }
    return model;
  };

  Utils.updateOrNew = function(data, model_type) {
    var cache, id, model;
    if ((cache = model_type.cache) && (id = Utils.dataId(data))) {
      if (model = cache.get(id)) {
        Utils.updateModel(model, data);
      }
    }
    if (!model) {
      model = Utils.isModel(data) ? data : Utils.dataToModel(data, model_type);
      if (model && cache) {
        cache.set(model.id, model);
      }
    }
    return model;
  };

  Utils.modelJSONSave = function(model_json, model_type, callback) {
    var model;
    model = new Backbone.Model(model_json);
    model._orm_never_cache = true;
    model.urlRoot = (function(_this) {
      return function() {
        var e, url;
        try {
          url = _.result(new model_type, 'url');
        } catch (_error) {
          e = _error;
        }
        return url;
      };
    })(this);
    return model_type.prototype.sync('update', model, Utils.bbCallback(callback));
  };

  Utils.isSorted = function(models, fields) {
    var last_model, model, _i, _len;
    fields = _.uniq(fields);
    for (_i = 0, _len = models.length; _i < _len; _i++) {
      model = models[_i];
      if (last_model && this.fieldCompare(last_model, model, fields) === 1) {
        return false;
      }
      last_model = model;
    }
    return true;
  };

  Utils.fieldCompare = function(model, other_model, fields) {
    var desc, field;
    field = fields[0];
    if (_.isArray(field)) {
      field = field[0];
    }
    if (field.charAt(0) === '-') {
      field = field.substr(1);
      desc = true;
    }
    if (model.get(field) === other_model.get(field)) {
      if (fields.length > 1) {
        return this.fieldCompare(model, other_model, fields.splice(1));
      } else {
        return 0;
      }
    }
    if (desc) {
      if (model.get(field) < other_model.get(field)) {
        return 1;
      } else {
        return -1;
      }
    } else {
      if (model.get(field) > other_model.get(field)) {
        return 1;
      } else {
        return -1;
      }
    }
  };

  Utils.jsonFieldCompare = function(model, other_model, fields) {
    var desc, field;
    field = fields[0];
    if (_.isArray(field)) {
      field = field[0];
    }
    if (field.charAt(0) === '-') {
      field = field.substr(1);
      desc = true;
    }
    if (model[field] === other_model[field]) {
      if (fields.length > 1) {
        return this.jsonFieldCompare(model, other_model, fields.splice(1));
      } else {
        return 0;
      }
    }
    if (desc) {
      if (JSON.stringify(model[field]) < JSON.stringify(other_model[field])) {
        return 1;
      } else {
        return -1;
      }
    } else {
      if (JSON.stringify(model[field]) > JSON.stringify(other_model[field])) {
        return 1;
      } else {
        return -1;
      }
    }
  };

  return Utils;

})();

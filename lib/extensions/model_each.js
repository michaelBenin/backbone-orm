var Cursor, Queue, _;

_ = require('underscore');

Queue = require('../queue');

Cursor = null;

module.exports = function(model_type, query, iterator, callback) {
  var method, model_limit, options, parsed_query, processed_count, runBatch;
  if (!Cursor) {
    Cursor = require('../cursor');
  }
  options = query.$each || {};
  method = options.json ? 'toJSON' : 'toModels';
  processed_count = 0;
  parsed_query = Cursor.parseQuery(_.omit(query, '$each'));
  _.defaults(parsed_query.cursor, {
    $offset: 0,
    $sort: 'id'
  });
  model_limit = parsed_query.cursor.$limit || Infinity;
  if (options.fetch) {
    parsed_query.cursor.$limit = options.fetch;
  }
  runBatch = function() {
    var cursor;
    cursor = model_type.cursor(parsed_query);
    return cursor[method].call(cursor, function(err, models) {
      var model, queue, _fn, _i, _len;
      if (err || !models) {
        return callback(new Error("Failed to get models. Error: " + err));
      }
      if (!models.length) {
        return callback(null, processed_count);
      }
      queue = new Queue(options.threads);
      _fn = function(model) {
        return queue.defer(function(callback) {
          return iterator(model, callback);
        });
      };
      for (_i = 0, _len = models.length; _i < _len; _i++) {
        model = models[_i];
        if (processed_count++ >= model_limit) {
          break;
        }
        _fn(model);
      }
      return queue.await(function(err) {
        if (err) {
          return callback(err);
        }
        if ((processed_count >= model_limit) || (models.length < parsed_query.cursor.$limit) || !parsed_query.cursor.$limit) {
          return callback(null, processed_count);
        }
        parsed_query.cursor.$offset += parsed_query.cursor.$limit;
        return runBatch();
      });
    });
  };
  return runBatch();
};

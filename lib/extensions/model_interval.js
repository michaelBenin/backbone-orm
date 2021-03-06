var INTERVAL_TYPES, Queue, Utils, moment, _;

_ = require('underscore');

moment = require('moment');

Queue = require('../queue');

Utils = require('../utils');

INTERVAL_TYPES = ['milliseconds', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'];

module.exports = function(model_type, query, iterator, callback) {
  var iteration_info, key, no_models, options, queue, range;
  options = query.$interval || {};
  if (!(key = options.key)) {
    throw new Error('missing option: key');
  }
  if (!options.type) {
    throw new Error('missing option: type');
  }
  if (!_.contains(INTERVAL_TYPES, options.type)) {
    throw new Error("type is not recognized: " + options.type + ", " + (_.contains(INTERVAL_TYPES, options.type)));
  }
  iteration_info = _.clone(options);
  if (!iteration_info.range) {
    iteration_info.range = {};
  }
  range = iteration_info.range;
  no_models = false;
  queue = new Queue(1);
  queue.defer(function(callback) {
    var start;
    if (!(start = range.$gte || range.$gt)) {
      return model_type.cursor(query).limit(1).sort(key).toModels(function(err, models) {
        if (err) {
          return callback(err);
        }
        if (!models.length) {
          no_models = true;
          return callback();
        }
        range.start = iteration_info.first = models[0].get(key);
        return callback();
      });
    } else {
      range.start = start;
      return model_type.findOneNearestDate(start, {
        key: key,
        reverse: true
      }, query, function(err, model) {
        if (err) {
          return callback(err);
        }
        if (!model) {
          no_models = true;
          return callback();
        }
        iteration_info.first = model.get(key);
        return callback();
      });
    }
  });
  queue.defer(function(callback) {
    var end;
    if (no_models) {
      return callback();
    }
    if (!(end = range.$lte || range.$lt)) {
      return model_type.cursor(query).limit(1).sort("-" + key).toModels(function(err, models) {
        if (err) {
          return callback(err);
        }
        if (!models.length) {
          no_models = true;
          return callback();
        }
        range.end = iteration_info.last = models[0].get(key);
        return callback();
      });
    } else {
      range.end = end;
      return model_type.findOneNearestDate(end, {
        key: key
      }, query, function(err, model) {
        if (err) {
          return callback(err);
        }
        if (!model) {
          no_models = true;
          return callback();
        }
        iteration_info.last = model.get(key);
        return callback();
      });
    }
  });
  return queue.await(function(err) {
    var length_ms, processed_count, runInterval, start_ms;
    if (err) {
      return callback(err);
    }
    if (no_models) {
      return callback();
    }
    start_ms = range.start.getTime();
    length_ms = moment.duration((_.isUndefined(options.length) ? 1 : options.length), options.type).asMilliseconds();
    if (!length_ms) {
      throw Error("length_ms is invalid: " + length_ms + " for range: " + (Utils.inspect(range)));
    }
    query = _.omit(query, '$interval');
    query.$sort = [key];
    processed_count = 0;
    iteration_info.index = 0;
    runInterval = function(current) {
      if (current.isAfter(range.end)) {
        return callback();
      }
      query[key] = {
        $gte: current.toDate(),
        $lte: iteration_info.last
      };
      return model_type.findOne(query, function(err, model) {
        var next;
        if (err) {
          return callback(err);
        }
        if (!model) {
          return callback();
        }
        next = model.get(key);
        iteration_info.index = Math.floor((next.getTime() - start_ms) / length_ms);
        current = moment.utc(range.start).add({
          milliseconds: iteration_info.index * length_ms
        });
        iteration_info.start = current.toDate();
        next = current.clone().add({
          milliseconds: length_ms
        });
        iteration_info.end = next.toDate();
        query[key] = {
          $gte: current.toDate(),
          $lt: next.toDate()
        };
        return iterator(query, iteration_info, function(err) {
          if (err) {
            return callback(err);
          }
          return runInterval(next);
        });
      });
    };
    return runInterval(moment(range.start));
  });
};

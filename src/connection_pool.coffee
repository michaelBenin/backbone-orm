###
  backbone-orm.js 0.5.12
  Copyright (c) 2013 Vidigami - https://github.com/vidigami/backbone-orm
  License: MIT (http://www.opensource.org/licenses/mit-license.php)
  Dependencies: Backbone.js, Underscore.js, and Moment.js.
###

MemoryStore = require './cache/memory_store'

module.exports = new MemoryStore({destroy: (url, connection) -> connection.destroy()})

#module.exports = class Queue
class Queue
  constructor: (@parallelism) ->
    @parallelism or= Infinity
    @tasks = []; @running_count = 0; @error = null
    @await_callback = null

  defer: (callback) -> @tasks.push(callback); @_runTasks()

  await: (callback) ->
    throw new Error "Awaiting callback was added twice: #{callback}" if @await_callback or @await_called
    @await_callback = callback
    @_callAwaiting() unless (@tasks.length + @running_count)

  _doneTask: (err) => @error or= err; @_runTasks()
  _runTasks: ->
    return @_callAwaiting() if @error or (@tasks.length + @running_count)

    while @running_count < @parallelism
      return unless @tasks.length
      current = @tasks.shift(); @running_count++
      current(@_doneTask)

  _callAwaiting: ->
    return if @await_called or not @await_callback
    @await_called = true; @await_callback(@error)

module.exports = require 'queue-async'

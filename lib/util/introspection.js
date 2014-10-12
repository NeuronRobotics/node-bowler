/* jshint node: true, esnext: true, expr: true */

// `dyio.util.introspection` namespace
// ===================================

/* cb_wrap(generator)
 * ------------------
 *
 * This function takes a generator function
 * which expects another generator function
 * as the last argument, and wraps it such
 * that it accpets a normal `function (err, ...args)`
 * callback instead.
 */
var cb_wrap = function (gen) {
  return function* () {
    var cb = arguments[arguments.length-1];
    var make_fake_iterator = function () {
      var args = Array.prototype.slice.apply(arguments);
      var done = false;
      return {
        next: function () {
          if (done) throw StopIteration;
          cb.apply(null, [null].concat(args));
          done = true;
          return { done: true };
        }
      };
    };

    try {
      yield* gen.apply(this, Array.prototype.slice.call(arguments, 0, arguments.length-1).concat(make_fake_iterator));
    }
    catch (err) {
      //throw err;
      cb(err);
    }
  };
};

/* BowlerIntrospector
 * ------------------
 *
 * Constructor: function(BowlerDevice)
 *
 * This utility class facilitates the
 * introspection of the given Bowler
 * device's capabilities by providing
 * a simple interface which calls a
 * callback once for each of the
 * items being introspected.  Currently,
 * it can introspect namespaces, the RPCs
 * in a given namespace, or all RPCs.
 *
 * Note: the use of this utility class requires
 * ECMA Harmony Generators to be supported,
 * and is designed to be used with a coroutine
 * library such as `gen-run`.
 */
var BowlerIntrospector = function (bowler_device) {
  this.bowler_device = bowler_device;
};

BowlerIntrospector.prototype = {
  _namespaces: function* (chld) {
    var ns0 = yield this.bowler_device.command_to.bcs.core._nms(0);
    var num_namespaces = ns0.num_namespaces;

    yield* chld(ns0, 0, num_namespaces);

    for (var i = 1; i < num_namespaces; i++) {
      yield* chld(yield this.bowler_device.command_to.bcs.core._nms(i), i, num_namespaces);
    }
  },

  _rpcs_in_namespace: function*(namespace, chld) {
    var make_rpc_obj = function (rpc_info, rpc_args) {
      return {
        namespace: rpc_info.namespace,
        name: rpc_info.name,
        send: {
          method: rpc_args.send_method,
          args: rpc_args.send_args
        },
        recv: {
          method: rpc_args.recv_method,
          args: rpc_args.recv_args
        }
      };
    };

    try {
      var curr_rpc_info = yield this.bowler_device.command_to.bcs.rpc._rpc(namespace, 0);
      var num_rpcs = curr_rpc_info.num_rpcs;
      var curr_rpc_args = yield this.bowler_device.command_to.bcs.rpc.args(namespace, 0);

      yield* chld(make_rpc_obj(curr_rpc_info, curr_rpc_args), 0, num_rpcs);

      for (var i = 1; i < num_rpcs; i++) {
        curr_rpc_info = yield this.bowler_device.command_to.bcs.rpc._rpc(namespace, i);
        curr_rpc_args = yield this.bowler_device.command_to.bcs.rpc.args(namespace, i);

        yield* chld(null, make_rpc_obj(curr_rpc_info, curr_rpc_args), i, num_rpcs);
      }
    }
    catch (err) {
      each_cb(err);
    }
  },

  /* ### rpcs_for_namespaces*(namespaces, each_cb) ###
   *
   * This method calls the given callback once for each
   * of the RPCs in the given namespaces.  It differs
   * from the method `all_rpcs*(callback)` in that
   * it uses the given list of namespaces, instead of
   * introspecting for them, like `all_rpcs*(callback)`
   *
   * callback: function(err, rpc_info_and_args, rpc_index, total_num_rpcs, namespace_index, total_num_namespaces)
   */
  rpcs_for_namespaces: function* (namespaces, each_cb) {
    var num_ns = namespaces.length;
    var make_mod_cb = function (ns_ind) {
      return function (err, rpc, rpc_ind, total_rpcs) {
        each_cb(err, rpc, rpc_ind, total_rpcs, ns_ind, num_ns);
      };
    };
    for (var i = 0; i < num_ns; i++) {
      yield* this.rpcs_in_namespace(namespaces[i], make_mod_cb(i));
    }
  },

  /* ### all_rpcs*(callback) ###
   *
   * This method iterates through all the
   * the RPCs in all of the supported namespaces,
   * calling the provided callback once for each RPC.
   *
   * callback: function(err, rpc_info_and_args, rpc_index, total_num_rpcs, namespace_index, total_num_namespaces)
   */
  all_rpcs: function* (each_cb) {
    try {
      yield* this._namespaces(function* (ns, ns_ind, num_ns) {
        var mod_cb = function (err, rpc, rpc_ind, total_rpcs) {
          each_cb(err, rpc, rpc_ind, total_rpcs, ns_ind, num_ns);
        };
        yield* this.rpcs_in_namespace(ns.name, mod_cb);
      });
    }
    catch (err) {
      each_cb(err);
    }
  }
};

/* ### namespaces*(callback) ###
 *
 * This method accepts a standard node-style
 * callback for an argument, and calls
 * it once for each namespace returned
 * from introspection of the Bowler device.
 *
 * callback: function (err, namespace_info, namespace_index, total_num_namespaces)
 *
 * Note: the version of this method prepended with
 * an underscore is designed to accept a generator
 * function instead, used in the style of `gen-run`
 * and similar continuations libraries.  The generator
 * function takes the same arguments as the callback,
 * except it does not have the `err` argument, since
 * generator error handling functions differently
 * with the continuations libraries.
 */
BowlerIntrospector.prototype.namespaces = cb_wrap(BowlerIntrospector.prototype._namespaces);

/* ### rpcs_in_namespace*(namespace, callback) ###
 *
 * This method accepts a standard node-style
 * callback for an argument, and calls it
 * once for each RPC in the given namespace
 * returned by introspection of the Bowler
 * device.
 *
 * callback: function (err, rpc_info_and_args, rpc_index, total_num_rpcs)
 *
 * The `rpc_info_and_args` object is an amalgamation
 * of the information returned by the two RPC
 * introspection calls, and takes the following
 * form:
 *
 *    {
 *      namespace: rpc_info.namespace,
 *      name: rpc_info.name,
 *      send: {
 *        method: rpc_args.send_method,
 *        args: rpc_args.send_args
 *      },
 *      recv: {
 *        method: rpc_args.recv_method,
 *        args: rpc_args.recv_args
 *      }
 *    }
 *
 * Note: similarly to `namespaces(callback)`, there
 * exists a version of this method prepended
 * with an '_' with accepts a generator function
 * instead of a normal callback.
 */
BowlerIntrospector.prototype.rpcs_in_namespace = cb_wrap(BowlerIntrospector.prototype._rpcs_in_namespace);

module.exports = {
  BowlerIntrospector: BowlerIntrospector,
  wrap_generator_callback: cb_wrap
};

/* jshint node: true, esnext: true */

var bowler_util = require('./util');

// `dyio.command_handler` namespace
// ================================

/* CommandHandler
 * --------------
 *
 * Constructor: function (BowlerDevice[, namespace[, multimethod]])
 *
 * This class provides an easy interface to send commands
 * to the given Bowler device.  When it is created, it will
 * attempt to populate the appropriate child CommandHandlers
 * for the sub-namespaces, as well as methods for the RPCs in
 * the current namespace.  This process occurs by using the
 * current values for `_builders` and `_rpc_send_methods` in
 * the given BowlerDevice instance.
 *
 * If no namespace is specified, the root of the `_builders` object
 * in the given BowlerDevice instance is used, with 'bcs' and
 * 'bcs.core' to make usage easier.
 *
 * The 'multimethod' optional parameter may be set to an RPC
 * name to indicate that this CommandHandler is acting like
 * a subnamespace, but actually refers to an RPC with multiple
 * methods.
 *
 * If you are using the autopopulation methods of BowlerDevice,
 * you should call the `repopulate` method of this object or
 * create a new instance after autopopulation has occured.
 */
var CommandHandler = function (bowler_device, namespace, multimethod) {
  this.bowler_device = bowler_device;

  if (!namespace) namespace = []; // start at the root

  /* ### namespace (and namespace_as_list) ###
   *
   * This property is a string in dot
   * notation representing the current
   * namespace in which to execute commands.
   *
   * It may be set and get, and is automatically
   * synchronized with the `namespace_as_list`
   * property, which is simply this value after
   * a call to `.split('.')`
   */
  if (Array.isArray(namespace)) {
    this.namespace_as_list = namespace;
  }
  else {
    this.namespace = namespace;
  }

  this._multimethod = multimethod;

  this.repopulate();
};

/* ### repopulate() ###
 *
 * This method populates the properties and methods
 * of this object based on this CommandHandler's namespace.
 *
 * Additionally, if the namespace is the root, 'bcs' and
 * 'bcs.core' will also be used.
 */
CommandHandler.prototype.repopulate = function (wipe) {
  var ns_obj = bowler_util.resolve_namespace_path(this.namespace, null, this.bowler_device._builders, 'Error resolving builders namespace path');
  var send_method_ns_obj = bowler_util.resolve_namespace_path(this.namespace, null, this.bowler_device._rpc_send_methods, 'Error resolving send methods namespace path');
  var recv_method_ns_obj = bowler_util.resolve_namespace_path(this.namespace, null, this.bowler_device._rpc_recv_methods, 'Error resolving recv methods namespace path');
  if (this._multimethod) {
    this.populate_with(ns_obj[this._multimethod], send_method_ns_obj[this._multimethod], recv_method_ns_obj[this._multimethod]);
  }
  else {
    this.populate_with(ns_obj, send_method_ns_obj, recv_method_ns_obj);
  }

  // if we're at the root, also populate from bcs.core and bcs
/*  if (this.namespace_as_list.length === 0) {
    var core_ns_obj = bowler_util.resolve_namespace_path('bcs.core', null, this.bowler_device._builders, 'Error resolving default namespace for builders');
    this.populate_with(core_ns_obj);

    var bcs_ns_obj = bowler_util.resolve_namespace_path('bcs', null, this.bowler_device._builders, 'Error resolving bcs namespace for builders');
    this.populate_with(bcs_ns_obj);
  }*/

  for (var prop in this) {
    if (this[prop] instanceof CommandHandler) {
      if (this['__ns_' + prop + '__']) {
        delete this['__ns_' + prop + '__'];
      }

      if (this['__mm_' + prop + '__']) {
        delete this['__mm_' + prop + '__'];
      }
    }
  }
};

/* ### populate_with(namespace_object) ###
 *
 * This method traverses the given namespace object,
 * creating special properties in the current CommandHandler
 * for the sub-namespaces and creating methods for the RPCs.
 */
CommandHandler.prototype.populate_with = function (ns_obj, send_method_ns_obj, recv_method_ns_obj) {
  var make_ns_getter = function (new_ns_name) {
    var new_ns = this.namespace_as_list.concat(new_ns_name);
    return function () {
      var ns_attr = '__ns_' + new_ns_name + '__';
      if (!this[ns_attr]) {
        Object.defineProperty(this, ns_attr, {
          configurable: true,  // the cache attribute shouldn't show up
          enumerable: false,
          value: new CommandHandler(this.bowler_device, new_ns)
        });
      }
      return this[ns_attr];
    };
  }.bind(this);

  var make_mm_getter = function (rpc_name) {
    return function () {
      var mm_attr = '__mm_' + rpc_name + '__';
      if (!this[mm_attr]) {
        Object.defineProperty(this, mm_attr, {
          configurable: true,  // the cache attribute shouldn't show up
          enumerable: false,
          value: new CommandHandler(this.bowler_device, this.namespace, rpc_name)
        });
      }
      return this[mm_attr];
    };
  };

  var make_rpc_caller = function (rpc_name, send_method, recv_method) {
    var builder = ns_obj[ns_elem_name];
    return function (/*...args, cb*/) {
      var args;
      var has_cb = false;
      // TODO(directxman12): should this be just >?
      if (arguments.length >= builder.length) {
        args = Array.prototype.slice.call(arguments, 0, builder.length);
        has_cb = true;
      } else {
        args = Array.prototype.slice.call(arguments);
      }
      var datagram = this.bowler_device.build_packet.apply(this.bowler_device, [send_method, this.namespace, rpc_name].concat(args));
      this.bowler_device.send_datagram(datagram);

      var evt_name = recv_method + ':' + this.namespace + '#' + rpc_name;

      if (has_cb) {
        var cb = arguments[args.length];
        this.bowler_device.once(evt_name, function (formatted_packet, method, namespace, rpc) {
          cb(formatted_packet);
        });
      }
      else {
        // we should return a function which has takes only a callback for an argument to use with run-gen
        return function (cb) {
          this.bowler_device.once(evt_name, function (formatted_packet, method, namespace, rpc) {
            cb(null, formatted_packet);
          });
        }.bind(this);
      }
    };
  };

  var ns_elem_name;
  if (this._multimethod) {
    for (ns_elem_name in ns_obj) {
      if (ns_elem_name === 'is_rpc') continue;

      this[ns_elem_name] = make_rpc_caller(this._multimethod, ns_elem_name, recv_method_ns_obj[ns_elem_name]);
    }
  }
  else {
    for (ns_elem_name in ns_obj) {
      if (ns_obj[ns_elem_name] instanceof Function) {
        // we have a handler
        var send_method = send_method_ns_obj[ns_elem_name];
        var recv_method = recv_method_ns_obj[ns_elem_name][send_method];
        this[ns_elem_name] = make_rpc_caller(ns_elem_name, send_method, recv_method);
      }
      else {
        // we have a namespace or a multi-method RPC
        if (ns_obj[ns_elem_name].is_rpc) {
          // we have a multi-method RPC
          Object.defineProperty(this, ns_elem_name, {
            enumerable: true,
            configurable: true,
            get: make_mm_getter(ns_elem_name)
          });

        }
        else {
          // we have a namespace
          Object.defineProperty(this, ns_elem_name, {
            enumerable: true,
            configurable: true,
            get: make_ns_getter(ns_elem_name)
          });
        }
      }
    }
  }
};

Object.defineProperty(CommandHandler.prototype, 'namespace', {
  enumerable: true,
  configurable: false,
  get: function () {
    return this.namespace_as_list.join('.');
  },
  set: function (val) {
    this.namespace_as_list = val.split('.');
  }
});

module.exports = {
  CommandHandler: CommandHandler
};

// `dyio.proxy_shim` namespace
// ===========================

module.exports = {}

if (global.Proxy) {
  var old_proxy = global.Proxy;
  module.exports._orig_Proxy = old_proxy;

  if (Proxy instanceof Function) { // Proxy is a constructor, so we have direct proxies
    module.exports.Proxy = old_proxy;
  }
  else {
    TARGET_NAME_PROPS = ['getOwnPropertyDescriptor', 'deleteProperty', 'has', 'hasOwn'];
    TARGET_PROPS = ['getOwnPropertyNames', 'getPrototypeOf', 'freeze', 'seal', 'preventExtensions', 'isFrozen', 'isSealed', 'isExtensible', 'enumerate', 'keys'];
    OTHER_PROPS = ['defineProperty', 'get', 'set', 'apply', 'construct'];
    UNWORKABLE_METHODS = ['isFrozen', 'isSealed', 'isExtensible', 'freeze', 'seal', 'preventExtensions'];
    OTHER_NAMES = {'deleteProperty': 'delete', 'freeze': 'fix', 'seal': 'fix', 'preventExtensions': 'fix'}

    var IndirectProxyHandler = function (obj, normal_handler) {
      this.target = obj;
      this.is_function = false;
      this.apply_handler = undefined;
      this.construct_handler = undefined;

      this.handle_missing = function (prop_name/*, ...args*/) {
        switch (prop_name) {
          case 'getOwnPropertyDescriptor':
          case 'getOwnPropertyNames':
          case 'getPrototypeOf':
          case 'keys':
            return Object[prop_name](this.target);
          case 'defineProperty':
            return Object.defineProperty.apply(Object, [this.target].concat(Array.prototype.slice.call(arguments, 1)));
          case 'deleteProperty':
            return (delete this.target[name]);
          case 'has':
            return (arguments[1] in this.target);
          case 'hasOwn':
            return ({}).hasOwnProperty.call(this.target, arguments[1]);
          case 'get':
            return this.target[arguments[1]];
          case 'set':
            return this.target[arguments[1]] = arguments[2];
          case 'apply':
            return this.target.apply(this.target, Array.prototype.slice.call(arguments, 1));
          case 'construct':
            return this.target.apply(Object.create(this.target.prototype), Array.prototype.slice.call(arguments, 1));
          default:
            throw new TypeError('Object ' + normal_handler.toString() + " has no method '" + prop + "'");
        }
      }

      TARGET_NAME_PROPS.forEach(function (prop) {
        //if (!normal_handler[prop]) return;
        if (UNWORKABLE_METHODS.indexOf(prop) > -1) return; // skip methods that won't work with the old proxy

        var prop_name = prop;
        if (prop in OTHER_NAMES) prop_name = OTHER_NAMES[prop];
        this[prop_name] = function (name) {
          if (!normal_handler[prop]) return this.handle_missing.apply(this, [prop, name]);
          else return normal_handler[prop].call(normal_handler, this.target, name);
        }.bind(this);
      }.bind(this));

      TARGET_PROPS.forEach(function (prop) {
        //if (!normal_handler[prop]) return;
        if (UNWORKABLE_METHODS.indexOf(prop) > -1) return; // skip methods that won't work with the old proxy

        var prop_name = prop;
        if (prop in OTHER_NAMES) prop_name = OTHER_NAMES[prop];
        this[prop_name] = function (name) {
          if (!normal_handler[prop]) return this.handle_missing.apply(this, [prop]);
          return normal_handler[prop].call(normal_handler, this.target);
        }.bind(this);
      }.bind(this));

      this.defineProperty = function (name, desc) {
        if (!normal_handler.defineProperty) return this.handle_missing.apply(this, ['defineProperty', name, desc]);
        return normal_handler.defineProperty.call(normal_handler, this.target, name, desc);
      }.bind(this);

      this.get = function (recver, name) {
        if (!normal_handler.get) return this.handle_missing.apply(this, ['get', name]);
        return normal_handler.get.call(normal_handler, this.target, name, recver);
      }.bind(this);

      this.set = function (recver, name, val) {
        if (!normal_handler.set) return this.handle_missing.apply(this, ['set', name, val]);
        return normal_handler.set.call(normal_handler, this.target, name, val, recver);
      }.bind(this);

      if (normal_handler.apply || normal_handler.construct) {
        this.is_function = true;
      }

      var self = this;
      this.apply_handler = function () {
        if (!normal_handler.apply) return this.handle_missing.apply(this, ['apply'].concat(arguments));
        var args = [self.target, this];
        args = args.concat(arguments);
        return normal_handler.apply.apply(normal_handler, args);
      }

      this.construct_handler = function () {
        if (!normal_handler.construct) return this.handle_missing.apply(this, ['construct'].concat(arguments));
        var args = [this.target];
        args = args.concat(arguments);
        return normal_handler.construct.construct(normal_handler, args);
      }.bind(this);
    }

    var DirectProxy = function (target, direct_handler) {
      var proto = Object.getPrototypeOf(target);
      var handler = new IndirectProxyHandler(target, direct_handler);
      if (handler.is_function) {
        return old_proxy.createFunction(handler, handler.apply_handler, handler.construct_handler);
      }
      else {
        return old_proxy.create(handler, proto);
      }
    };

    module.exports.Proxy = DirectProxy;
  }
}

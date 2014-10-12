// `dyio.extra_namespaces` namespace
// =================================

var bowler_util = require('./util');

/* Note: sub-namespaces under this namespace
 * should have their `module.exports` equal
 * to an instance of a subclass of the
 * `BowlerNamespace` class.
 */

/* BowlerNamespace
 * ---------------
 *
 * Constructor: function()
 *
 * This class represents the various
 * parsers, builders, etc required to
 * use a namespace with a BowlerDevice.
 *
 * It contains five properties:
 *
 * - *root*: the namespace path, in dot notation
 * - *parsers*: the parsers object
 *   (see BowlerDevice#_parsers)
 * - *builders*: the builders object
 *   (see BowlerDevice#_builders)
 * - *send_methods*: the object containing
 *   send method information (see
 *   BowlerDevice#_rpc_send_methods)
 * - *recv_methods*: the object containing
 *   receive method information (see
 *   BowlerDevice#_rpc_recv_methods)
 *
 * Note that all of the 'object' properties
 * above should treat the root of the object
 * as if it were actually the object represented
 * by traversing the path to the value of `root`
 * (i.e. they should not include the nested namespace
 * hierarcy in the object -- that is handled automatically
 * by `_import_into_objs`)
 */
var BowlerNamespace = function () {
  this.root = '';
  this.parsers = {};
  this.builders = {};
  this.send_methods = {};
  this.recv_methods = {};
};

BowlerNamespace.prototype = {
  /* ### _import_into_objs(parsers, builders, send_methods, recv_methods) ###
   *
   * This method imports the various parts of this
   * namespace into the given objects.
   */
  _import_into_objs: function (parsers_obj, builders_obj, send_methods_obj, recv_methods_obj) {
    var path = this.root.split('.');
    if (path.length === 1 && path[0] === '') {
      path = [];
    }

    for (var i = 0; i < path.length; i++) {
      if (!parsers_obj[path[i]]) parsers_obj[path[i]] = {};
      if (!builders_obj[path[i]]) builders_obj[path[i]] = {};
      if (!send_methods_obj[path[i]]) send_methods_obj[path[i]] = {};
      if (!recv_methods_obj[path[i]]) recv_methods_obj[path[i]] = {};

      parsers_obj = parsers_obj[path[i]];
      builders_obj = builders_obj[path[i]];
      send_methods_obj = send_methods_obj[path[i]];
      recv_methods_obj = recv_methods_obj[path[i]];
    }

    bowler_util.extend(parsers_obj, this.parsers);
    bowler_util.extend(builders_obj, this.builders);
    bowler_util.extend(send_methods_obj, this.send_methods);
    bowler_util.extend(recv_methods_obj, this.recv_methods);
  },

  /* ### import_into(BowlerDevice) ###
   *
   * This method imports the various components of
   * this namespace into the given BowlerDevice.
   *
   * See also BowlerDevice#supports_namespace
   */
  import_into: function (bowler_dev) {
    this._import_into_objs(bowler_dev._parsers, bowler_dev._builders, bowler_dev._rpc_send_methods, bowler_dev._rpc_recv_methods);
  }
};

module.exports = {
  BowlerNamespace: BowlerNamespace,
};

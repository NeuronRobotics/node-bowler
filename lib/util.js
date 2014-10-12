/* jshint node: true, esnext: true */

// `dyio.util` namespace
// =====================

/* resolve_namespace_path(path_str, rpc, root_obj, err_msg)
 * --------------------------------------------------------
 *
 * This function takes a namespace path (and an rpc name,
 * which may be undefined or null), an set of nested objects
 * containing namespaces and RPCs as specified in the documentation
 * for _builders and _parsers, and an error message prefix.  It resolves
 * the string path (which should be separated by '.'), and resolves it
 * in the hierarchy of nested objects.  If the path does not lead to an
 * object of any type, an Error will be thrown the the specified message
 * as the prefix.  Otherwise, the object at the given path will be returned.
 */
var resolve_namespace_path = function (path_str, rpc, root_obj, err_msg) {
  var obj = root_obj;
  var path = path_str.split('.');
  if (rpc) path.push(rpc);
  if (path.length === 1 && path[0] === '') {
    return root_obj;
  } else {
    for (var i = 0; i < path.length; i++) {
      if (obj === undefined) {
        var parent_ns = path.slice(0,i-1).join('.');
        return new Error(err_msg+' -- undefined namespace under '+parent_ns+': '+namespace_list[i-1]);
      }
      if (path[i] == 'com') continue;
      obj = obj[path[i]];
    }
    if (!obj) {
        var parent_elem = path.slice(0,-1).join('.');
        return new Error(err_msg+' -- undefined last path element under ' + parent_elem + ': ' + path[path.length-1]);
    }
    return obj;
  }
};

/* make_checksum(Buffer)
 * ---------------------
 *
 * This function takes a buffer and computes a simple checksum
 * by summing the bytes and then returning the lowest byte of
 * the result.  Note that JS converts all operands of bitwise
 * operations to big-endian format before applying the operations,
 * so we do not need to worry about the endianness of our platform.
 */
var make_checksum = function (buff) {
  var sum = Array.prototype.reduce.call(buff, function (a, b) { return a + b; });
  return sum & 0x000000ff;
};

/* isObject(potential_object)
 * ------------------------
 *
 * This method determines if
 * something is an object by
 * attempting to call `Object.keys`
 * on it, and checking for errors.
 *
 * It will return true for objects
 * and arrays, and false for functions,
 * numbers, etc.
 */
var isObject = function (obj) {
  try {
    Object.keys(obj);
    return true;
  }
  catch (err) {
    return false;
  }
};

/* extend(dest, src)
 * -----------------
 *
 * This method copies properties
 * from `src` into `dest`, recursively
 * merging sub-objects.  If it encounters
 * a conflict on a non-mergable value
 * (i.e. anything that causes `util.isObject`
 * to return false), it will keep the value
 * from `dest`.
 */
var extend = function (dest, src) {
  for (var prop in src) {
    if (dest[prop] === undefined) {
      dest[prop] = src[prop];
    }
    else if (isObject(src[prop])) {
      extend(dest[prop], src[prop]);
    }
  }
};

module.exports = {
  make_checksum: make_checksum,
  resolve_namespace_path: resolve_namespace_path,
  isObject: isObject,
  extend: extend
};

// `dyio.extra_namespaces.bcs_core` namespace
// =====================================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');
var packet = require('../packet');

// this namespaces provides the required "glue"
// to use the core bowler functionality

var BcsCoreNamespace = function () {
  this.root = 'bcs.core';

  this.parsers = {
    _png: function (src) { return {}; },
    _nms: function (src) {
      var all_bytes = src.bytes();
      var raw_name = all_bytes.toString();
      var len = all_bytes.partial;
      var name_len_with_star = raw_name.indexOf(';');
      return {
        raw_str: raw_name,
        name: src.bytes(0, name_len_with_star-3).toRawString(),
        version_str: src.bytes(name_len_with_star+1, len-4).toRawString(),
        num_namespaces: src.byte(len).toInt()
      };
    }
  };

  this.builders = {
    _png: function (bldr) {},
    _nms: function (bldr, num) {
      bldr.byte(0).fromInt(num);
    }
  };

  this.send_methods = {
    _png: 'get',
    _nms: 'get'
  };

  this.recv_methods = {
    // responses to sent packets
    _png: { get: 'post' },
    _nms: { get: 'post' }
  };
};

util.inherits(BcsCoreNamespace, BowlerNamespace);

module.exports = new BcsCoreNamespace();


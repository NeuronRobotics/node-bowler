// `dyio.extra_namespaces.bcs_rpc` namespace
// =====================================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');
var packet = require('../packet');

// this namespaces provides the required "glue"
// to use the RPC introspection functionality

var BcsRpcNamespace = function () {
  this.root = 'bcs.rpc';

  this.parsers = {
    _rpc: function (src) {
      return {
        namespace: src.byte(0).lookup_in(self.supported_namespaces) || src.byte(0).toInt(),
        rpc_index: src.byte(1).toInt(),
        num_rpcs: src.byte(2).toInt(),
        name: src.byte(3).to_end().toString()
      };
    },
    args: function (src) {
      var send_args_rng = src.byte(3).to_null();
      return {
        namespace: src.byte(0).lookup_in(self.supported_namespaces) || src.byte(0).toInt(),
        rpc_index: src.byte(1).toInt(),
        send_method: src.byte(2).lookup_in(BOWLER_METHODS),
        send_args: send_args_rng.map_each(function (b) { return b.lookup_in(packet.data_codes); }),
        recv_method: src.byte(3+send_args_rng.end+1).lookup_in(BOWLER_METHODS),
        recv_args: src.byte(4+send_args_rng.end+1).to_null().map_each(function (b) { return b.lookup_in(packet.data_codes); })
      };
    }
  };

  this.builders = {
    _rpc: function (bldr, namespace, ind) {
      debugger;
      // TODO(directxman12): figure out how to reference 'this'
      bldr.byte(0).fromInt(self.supported_namespaces_hr[namespace]);
      bldr.byte(1).fromInt(ind);
    },
    args: function (bldr, namespace, ind) {
      debugger;
      // TODO(directxman12): figure out how to reference 'this'
      bldr.byte(0).fromInt(self.supported_namespaces_hr[namespace]);
      bldr.byte(1).fromInt(ind);
    }
  };

  this.send_methods = {
    _rpc: 'get',
    args: 'get'
  };

  this.recv_methods = {
    // responses to sent packets
    _rpc: { get: 'post' },
    args: { get: 'post' }
  };
};

util.inherits(BcsRpcNamespace, BowlerNamespace);

module.exports = new BcsRpcNamespace();



// `dyio.extra_namespaces.bcs_pid` namespace
// =========================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');
var packet = require('../packet');

// This namespace provides the require "glue"
// to use RPCs in the 'bcs.pid' namespace.

var BcsPidNamespace = function () {
  this.root = 'bcs.pid';

  this.parsers = {
    apid: {
      is_rpc: true,
      status: function (src) {
        return {
          location: src.byte(0).toInt(),
          trace: src.byte(1).toInt()
        };
      },
      post: function (src) {
        return { values: src.bytes().toInt32Array() };
      }
    },
    _pid: {
      is_rpc: true,
      status: function (src) {
        return {
          location: src.byte(0).toInt(),
          trace: src.byte(1).toInt()
        };
      },
      post: function (src) {
        return {
          channel: src.byte(0).toInt(),
          position: src.byte(1,4).toInt()
        };
      }
    },
    cpid: {
      is_rpc: true,
      post: function (src) {
        return {
          channel: src.byte(0).toInt(),
          enabled: src.byte(1).toBool(),
          polarity: src.byte(2).toInt(), // TODO(directxman12): is this actually a bool?
          async: src.byte(3).toBool(),
          Kp: src.bytes(4, 7).toFixedPointWithTwoPlaces(),
          Ki: src.bytes(8, 11).toFixedPointWithTwoPlaces(),
          Kd: src.bytes(12, 15).toFixedPointWithTwoPlaces(),
          latch: src.bytes(304, 307).toInt(),
          use_index_latch: src.bytes(308).toInt(), // TODO(directxman12): is this actually a bool?
          stop_on_latch: src.bytes(309).toBool()
        };
      },
      status: function (src) {
        return {
          location: src.byte(0).toInt(),
          trace: src.byte(1).toInt()
        };
      }
    },
    cpdv: {
      is_rpc: true,
      post: function (src) {
        return {
          channel: src.byte(0).toUnsignedInt(),
          Kp: src.byte(1, 100).toFixedPointWithTwoPlaces(),
          Kd: src.byte(101,200).toFixedPointWithTwoPlaces()
        };
      },
      status: function (src) {
        return {
          location: src.byte(0).toInt(),
          trace: src.byte(1).toInt()
        };
      },
    },
    gpdc: function (src) {
      return { channel: src.bytes(0,3).toInt() };
    },
    _vpd: function (src) {
      return {
        location: src.byte(0).toInt(),
        trace: src.byte(0).toInt()
      };
    },
    rpid: function (src) {
      return {
        location: src.byte(0).toInt(),
        trace: src.byte(0).toInt()
      };
    },
    kpid: function (src) {
      return {
        location: src.byte(0).toInt(),
        trace: src.byte(0).toInt()
      };
    },
  };

  this.builders = {
    apid: {
      is_rpc: true,
      post: function (bldr, time, set_points) {
        bldr.bytes(0, 3).fromInt(time);
        var pts_width = packet.data_types.UInt32String.get_width(set_points);
        bldr.bytes(4, 4+pts_width-1).fromInt32String(set_points);
      },
      get: function (bldr) {}
    },
    _pid: {
      is_rpc: true,
      post: function (bldr, channel, time, set_point) {
        bldr.byte(0).fromInt(channel);
        bldr.byte(1, 4).fromInt(set_point);
        bldr.byte(5, 8).fromInt(time);
      },
      get: function (bldr, channel) {
        bldr.byte(0).fromInt(channel);
      }
    },
    cpid: {
      is_rpc: true,
      get: function (bldr, channel) {
        bldr.byte(0).fromInt(channel);
      },
      critical: function (bldr, channel, enabled, polarity, async, Kp, Ki, Kd, latch, use_index_latch, stop_on_latch) {
        bldr.byte(0).fromInt(channel);
        bldr.byte(1).fromBool(enabled);
        bldr.byte(2).fromInt(polarity);
        bldr.byte(3).fromBool(async);

        bldr.bytes(4, 103).fromFixedPointWithTwoPlaces(Kp);
        bldr.bytes(104, 203).fromFixedPointWithTwoPlaces(Ki);
        bldr.bytes(204, 303).fromFixedPointWithTwoPlaces(Kd);

        bldr.bytes(304, 307).fromInt(latch);
        bldr.byte(308).fromInt(use_index_latch);
        bldr.byte(309).fromBool(stop_on_latch);
      }
    },
    cpdv: {
      is_rpc: true,
      get: function (bldr, channel) {
        bldr.byte(0).fromInt(channel);
      },
      critical: function (bldr, channel, Kp, Kd) {
        bldr.byte(0).fromInt(channel);
        bldr.bytes(1, 4).fromFixedPointWithTwoPlaces(Kp);
        bldr.bytes(5, 8).fromFixedPointWithTwoPlaces(Kd);
      },
    },
    gpdc: function (bldr) {},
    _vpd: function (bldr, channel, time, velocity_set_point_val) {
      bldr.byte(0).fromInt(channel);
      bldr.bytes(1, 4).fromInt(velocity_set_point_val);
      bldr.bytes(5, 8).fromInt(time);
    },
    rpid: function (bldr, channel, encoding) {
      bldr.byte(0).fromInt(channel);
      bldr.byte(1, 4).fromInt(encoding);
    },
    kpid: function (bldr) {},
  };

  this.send_methods = {
    apid: ['get', 'post'],
    _pid: ['get', 'post'],
    cpid: ['get', 'critical'],
    cpdv: ['get', 'critical'],
    gpdc: 'get',
    _vpd: 'post',
    rpid: 'post',
    kpid: 'critical'
  };

  this.recv_methods = {
    apid: { get: 'post', post: 'status' },
    _pid: { get: 'post', post: 'status' },
    cpid: { get: 'post', critical: 'status' },
    cpdv: { get: 'post', critical: 'status' },
    gpdc: { get: 'post' },
    _vpd: { post: 'status' },
    rpid: { post: 'status' },
    kpid: { critical: 'status' }
  };
};

util.inherits(BcsPidNamespace, BowlerNamespace);

module.exports = new BcsPidNamespace();

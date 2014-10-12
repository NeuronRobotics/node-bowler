// `dyio.extra_namespaces.bcs_io_setmode` namespace
// ========================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');

var CHANNEL_MODES = {
  0x00: 'no_change',
  0x01: 'off',
  0x02: 'digital_in',
  0x03: 'digital_out',
  0x04: 'analog_in',
  0x05: 'analog_out',
  0x06: 'pwm_out',
  0x07: 'servo_out',
  0x08: 'usart_tx',
  0x09: 'usart_rx',
  0x0A: 'spi_mosi',
  0x0B: 'spi_miso',
  0x0C: 'spi_clock',
  0x0D: 'spi_select',
  0x0E: 'count_in_int',
  0x0F: 'count_in_dir',
  0x10: 'count_in_home',
  0x11: 'count_out_int',
  0x12: 'count_out_dir',
  0x13: 'count_in_home',
  0x14: 'dc_motor_vel',
  0x15: 'dc_motor_dir',
  0x16: 'ppm_in'
};

var BcsIOSetModeNamespace = function () {
  this.root = 'bcs.io.setmode';

  this.parsers = {
    schm: function (src) { return {}; },
    sacm: function (src) { return {}; }
  };

  this.builders = {
    schm: function (bldr, pin, mode, async) {
      bldr.byte(0).fromInt(pin);
      // accept either an int or a string
      bldr.byte(1).fromInt(CHANNEL_MODES[mode] || mode);
      if (async !== undefined) {
        bldr.byte(2).fromBool(async);
      }
    },
    sacm: function (bldr, channels) {
      for (var i = 0; i < channels.length; i++) {
        bldr.byte(i).fromInt(CHANNEL_MODES[mode] || mode);
      }
    }
  };

  this.send_methods = {
    schm: 'post',
    sacm: 'post'
  };

  this.recv_methods = {
    schm: { post: 'post' },
    sacm: { post: 'post' }
  };
};

util.inherits(BcsIONamespace, BowlerNamespace);

module.exports = new BcsIONamespace();


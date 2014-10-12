// `dyio.extra_namespaces.bcs_safe` namespace
// ==========================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');

var BcsSafeNamespace = function () {
  this.root = 'bcs.io';

  this.parsers = {
  };

  this.builders = {
  };

  this.send_methods = {
    safe: ['get', 'post']
  };

  this.recv_methods = {
    safe: { get: 'post', post: 'post' }
  };
};

util.inherits(BcsSafeNamespace, BowlerNamespace);

module.exports = new BcsIONamespace();


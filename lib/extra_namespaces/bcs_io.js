// `dyio.extra_namespaces.bcs_io` namespace
// ========================================

var BowlerNamespace = require('../extra_namespaces').BowlerNamespace;
var util = require('util');

var BcsIONamespace = function () {
  this.root = 'bcs.io';

  this.parsers = {
  };

  this.builders = {
  };

  this.send_methods = {
    gchm: 'get',
    gacm: 'get',
    gchv: 'get',
    gacv: 'get',
    asyn: ['get', 'post', 'critical'],
    gchc: 'get',
    gcml: 'get',
    schv: ['post', 'critical'],
    sacv: 'post',
    cchn: 'critical',
  };

  this.recv_methods = {
    gchm: { get: 'post' },
    gacm: { get: 'post' },
    gchv: { get: 'post' },
    gacv: { get: 'post', async: 'async' },
    asyn: { get: 'post', post: 'post', critical: 'post' },
    gchc: { get: 'post' },
    gcml: { get: 'post' },
    schv: { post: 'post' },
    sacv: { post: 'post' },
    cchn: { critical: 'post' },
  };
};

util.inherits(BcsIONamespace, BowlerNamespace);

module.exports = new BcsIONamespace();

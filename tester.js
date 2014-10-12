//var repl = require('repl');
var dyio = require('./lib/devices/nr_dyio.js');

var d = new dyio.DyIO('/dev/ttyACM0');
console.log('outside constructor!');

var repl_options = {
    prompt: 'dyio> ',
    useGlobal: true,
};

d.connect(function () {
    console.log('look, a DyIO: ' + this);
    console.log('this DyIO supports ' + Object.keys(this.supported_namespaces_hr).join(', '));
    this.command_to.bcs.core._png()(console.log);
    //repl.start(repl_options);
    debugger;
    //this.command_to.bcs.core._nms(0)(console.log);
});

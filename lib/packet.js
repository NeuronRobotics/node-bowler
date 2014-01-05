/* jshint node: true, esnext: true, eqeqeq: false */

var os = require('os');

// `dyio.packet` Namespace
// ==============================

const NATIVE_BE = os.endianness() == 'BE';


// data_types
// ----------
//
// This object contains information
// about the various supported data
// types in the Bowler protocol.  Each
// entry has a key with a readable,
// CamelCased name for the type, and
// has an entry which is an object
// with the following properties:
//
// - header_name: *[string]* the name of the type in the bowler header file
// - width: *[number]* the number of bytes in the type, of null for variable
// - code: *[number]* the number that represents the type in the Bowler introspection protocol,
// - deserialize: *[function(Buffer, index)]* a function which take the appropriate number of bytes from the
//                                            position in the buffer and return the resulting parsed object.
//                                            If the width of the type is variable, an array of the form
//                                            `[object, len]` will be returned, where `len` is the amount
//                                            of data read
// - serialize: *[function(input, Buffer, index)]* a function which takes the input data and serializes it into
//                                                 byte form, writing the result to the given Buffer at the given
//                                                 index, and returning the number of bytes written.
// - get_width: *[function(val)]* *present only when width is variable* a function which calculates the width of
//                                javascript value after it has been serialized
var data_types = {
  'Bool': {
    header_name: 'BOWLER_BOOL',
    width: 1,
    code: 43,
    deserialize: function (buff, ind) { return !!buff[ind]; },
    serialize: function (obj, buff, ind) {
      if (obj) {
        buff[ind] = 1;
      }
      else {
        buff[ind] = 0;
      }
      return 1;
    }
  },
  'UInt8': {
    header_name: 'BOWLER_I08',
    width: 1,
    code: 8,
    deserialize: function (buff, ind) { return buff.readUInt8(ind); },
    serialize: function (obj, buff, ind) { buff.writeUInt8(obj, ind); return 1; }
  },
  'Int16': {
    header_name: 'BOWLER_I16',
    width: 2,
    code: 16,
    deserialize: function (buff, ind) { return buff.readInt16BE(ind); },
    serialize: function (obj, buff, ind) { buff.writeInt16BE(obj, ind); return 2; }
  },
  'Int32': {
    header_name: 'BOWLER_I32',
    width: 4,
    code: 32,
    deserialize: function (buff, ind) { return buff.readInt32BE(ind); },
    serialize: function (obj, buff, ind) { buff.writeInt32BE(obj, ind); return 4; }
  },
  'ByteBuffer': {
    header_name: 'BOWLER_STR',
    width: null,
    get_width: function (val) { return val.length+1; },
    code: 37,
    deserialize: function (buff, ind) {
      var len = buff.readUInt8(ind);
      var new_buff = new Buffer(len);
      buff.copy(new_buff, 0, ind+1, ind+1+len);
      return [new_buff, len+1];
    },
    serialize: function (in_buff, buff, ind) {
      buff.writeUInt8(in_buff.length, ind);
      in_buff.copy(buff, ind+1);
      return in_buff.length + 1;
    }
  },
  'UInt8Array': {
    header_name: 'BOWLER_STR',
    width: null,
    get_width: function (val) { return val.length+1; },
    code: 37,
    deserialize: function (buff, ind) {
      var len = buff.readUInt8(ind);
      return [new Uint8Array(buff.slice(ind, ind+len).toArrayBuffer()), len+1];
    },
    serialize: function (input, buff, ind) {
      var len = ab.length;
      buff.writeUInt8(len, ind);
      for (var i = 0; i < len; i++) {
        buff.writeUInt8(ab[i], ind+1+i);
      }
      return len+1;
    }
  },
  'Int32Array': {
    header_name: 'BOWLER_I32STR',
    width: null,
    get_width: function (val) { return val.length*4+1; },
    code: 38,
    deserialize: function (buff, ind) {
      var len = buff.readUInt8(ind);
      if (NATIVE_BE) {
        return [new Int32Array(buff.slice(ind+1, ind+1+len*4).toArrayBuffer()), len*4+1];
      }
      else {
        var arr = new Int32Array(len);
        for (var i = 0; i < len; i++) {
          arr[i] = buff.readInt32BE(ind+1+i*4);
        }
        return [arr, len*4+1];
      }
    },
    serialize: function (input, buff, ind) {
      var len = ab.length;
      buff.writeUInt8(len, ind);
      for (var i = 0; i < len; i++) {
        buff.writeInt32BE(ab[i], ind+1+i*4);
      }
      return len*4+1;
    }
  },
  'NullTerminatedString': {
    header_name: 'BOWLER_ASCII',
    width: null,
    get_width: function (val, enc) {
      if (!enc) enc = 'ascii';
      return Buffer.byteLength(val, enc);
    },
    code: 39,
    deserialize: function (buff, ind, enc) {
      if (!enc) enc = 'ascii';
      var stop_ind;
      for (stop_ind = ind; stop_ind < buff.length; stop_ind++) {
        if (buff[stop_ind] == '\0') break;
      }
      return [buff.toString(enc, ind, stop_ind), stop_ind-ind+1];
    },
    serialize: function (input_str, buff, ind, enc) {
      if (!enc) enc = 'ascii';
      if (input_str.charCodeAt(input_str.length-1) === 0) {
        return buff.write(input_str, ind, buff.length - ind, enc);
      }
      else {
        return buff.write(input_str+'\0', ind, buff.length - ind, enc);
      }
    }
  },
  'FixedPointTwoPlaces': {
    header_name: 'BOWLER_FIXED100',
    width: 4,
    code: 41,
    deserialize: function (buff, ind) { return buff.readInt32BE(ind)/100.0; },
    serialize: function (input_obj, ind) { buff.writeInt32BE(input_obj*100, ind); return 4; }
  },
  'FixedPointThreePlaces': {
    header_name: 'BOWLER_FIXED1K',
    width: 4,
    code: 42,
    deserialize: function (buff, ind) { return buff.readInt32BE(ind)/1000.0; },
    serialize: function (input_obj, ind) { buff.writeInt32BE(input_obj*1000, ind); return 4; }
  }
};


/* PacketByteContainer
 * -------------------
 *
 * Constructor: function(src)
 *
 * This class is used to extract data
 * from a raw byte buffer.  A base byte
 * buffer is passed to the constructor.
 * Helper methods then construct `ByteRange`
 * objects using this base byte buffer.
 */
var PacketByteContainer = function(src) {
  /* ### ByteRange ###
   *
   * Constructor: function(src, start, end)
   *
   * This class represents a range of bytes.
   * Its constructor takes a base byte buffer
   * which contains at least the range of bytes
   * in this ByteRange, as well as a start and end
   * position (0-indexed, inclusive).  A new byte
   * buffer is then created by copying the contents
   * of the source buffer, starting at the start position
   * and going up through the end position.
   *
   * None of the methods in this class modify the original
   * source byte buffer.
   */
  var ByteRange = function(src, start, end) {
    this.buff = Buffer(end - start+1);
    src.copy(this.buff, 0, start, end+1);
    this.src = src;
    this.start = start;
    this.end = end;
    this.partial = null;

    /* #### masked_with(mask)
     *
     * This method applies a one-byte mask
     * to each of the values in this ByteRange
     * using a bitwise AND operation.
     */
    this.masked_with = function(mask) {
      var res = new ByteRange(this.src, this.start, this.end);
      for (var i = 0; i < res.buff.length; i++) res.buff[i] = res.buff[i] & mask;
      return res;
    };

    /* #### to_end() ####
     *
     * This method returns a new ByteRange
     * object which starts at the beginning
     * of this ByteRange and ends at the end
     * of the source byte buffer.
     */
    this.to_end = function() {
      return new ByteRange(this.src, this.start, this.src.length);
    };

    /* #### to_null(include_null = false) ####
     *
     * This method return a new ByteRange
     * object which starts at the beginning
     * of this ByteRange and ends just before
     * the first null character encountered
     * (or the end of the source byte Buffer,
     * if no null character is found).  If
     * include_null is set to true, then
     * the null character will be included
     * in the byte range.
     */
    this.to_null = function(excl_null) {
      var i;
      for (i = this.start; i < this.src.length; i++) {
        if (this.src[i] === 0x00) break;
      }
      if (!incl_null) i--;
      return new ByteRange(this.src, this.start, i);
    };

    /* #### format(func) ####
     *
     * This method returns calls the
     * given function with the underlying
     * byte buffer for this ByteRange as
     * the argument, and returns the results.
     */
    this.format = function(func) {
      return func(this.buff);
    };

    /* #### toInt() ####
     *
     * This method returns the bytes in
     * this ByteRange as an int,
     * automatically adjusting for sizes
     * of 8, 16, or 32 bits
     */
    this.toInt = function() {
      if (this.buff.length == 1) return data_types.UInt8.deserialize(this.buff, 0);
      else if (this.buff.length == 2) return data_types.Int16.deserialize(this.buff, 0);
      else if (this.buff.length == 4) return data_types.Int32.deserialize(this.buff, 0);
      else throw new Error("Cannot read ints greater than 32 bits in size!");
    };

    /* #### toString(enc = 'ascii') ####
     *
     * This method returns the bytes in
     * this ByteRange as a String
     * with the given encoding (ASCII
     * by default).  Note that only the bytes
     * up to (but not including) a null character ('\0')
     * are returned.
     */
    this.toString = function(enc) {
      if (!enc) enc = 'ascii';
      var res = data_types.NullTerminatedString.deserialize(this.buff, 0, enc);
      this.partial = res[1];
      return res[0];
    };

    /* #### toRawString(enc = 'ascii') ####
     *
     * This method returns the bytes
     * in this ByteRange as a String using
     * the given encoding.  Note that it does
     * not do any fancy checking like toString;
     * it simply returns the bytes a String.
     */
    this.toRawString = function(enc) {
      if (!enc) enc = 'ascii';
      return this.buff.toString(enc);
    };

    /* #### getBuffer() ####
     *
     * This method simply returns the
     * underlying byte buffer for this
     * ByteRange.
     */
    this.getBuffer = function() {
      return this.buff;
    };

    /* #### getBuffer() ####
     *
     * This method returns a *new* buffer
     * based on the underlying byte buffer
     * for this ByteRange.  The first byte
     * is interpreted as a uint representing
     * the number of bytes to read.  That number
     * of bytes are returned in a new Buffer.
     */
    this.toBuffer = function() {
      var res = data_types.ByteBuffer.deserialize(this.buff, 0);
      this.partial = res[1];
      return res[0];
    };

    /* #### toUnsignedInt8Array() ####
     *
     * This method returns an Uint8Array based
     * on the bytes in the current ByteRange.
     * The first byte in the ByteRange is interpreted
     * as a uint representing the number of bytes to read.
     * That number of bytes are then read, and returned as
     * the aforementioned typed array of 1-byte unsigned integers.
     */
    this.toUnsignedInt8Array = function () {
      var res = data_types.UInt8Array.deserialize(this.buff, 0);
      this.partial = res[1];
      return res[0];
    };

    /* #### toInt32Array() ####
     *
     * This method returns an Int32Array based
     * on the bytes in the current ByteRange.
     * The first byte in the ByteRange is interpreted
     * as a uint representing the number of bytes to read.
     * That number of bytes are then read, and returned as
     * the aforementioned typed array of 1-byte integers.
     */
    this.toInt32Array = function () {
      var res = data_types.Int32Array.deserialize(this.buff, 0);
      this.partial = res[1];
      return res[0];
    };

    /* #### toFixedPointWithTwoPlaces() ####
     *
     * This method returns a number based on
     * the bytes of the current ByteRange.
     * It does so by extracting a 32-bit signed
     * integer, and then diving the contents by
     * 100, producing a fixed point number with
     * two decimal places of information.
     */
    this.toFixedPointWithTwoPlaces = function () {
      return data_types.FixedPointTwoPlaces.deserialize(this.buff, 0);
    };

    /* #### toFixedPointWithThreePlaces() ####
     *
     * This method returns a number based on
     * the bytes of the current ByteRange.
     * It does so by extracting a 32-bit signed
     * integer, and then diving the contents by
     * 1000, producing a fixed point number with
     * three decimal places of information.
     */
    this.toFixedPointWithThreePlaces = function () {
      return data_types.FixedPointThreePlaces.deserialize(this.buff, 0);
    };

    /* #### toBool() ####
     *
     * This method returns the first
     * byte of this ByteRange as a
     * boolean value (0 means false, any
     * other value is true).
     */
    this.toBool = function() { return data_types.Bool.deserialize(this.buff, 0); };

    /* #### lookup_in(arr) ####
     *
     * This method looks up the first byte
     * of this ByteRange in the given Array
     * or Object and returns that value.
     */
    this.lookup_in = function(arr) { return arr[this.buff[0]]; };

    /* #### map_every(interval_or_func[, func]) ####
     *
     * This method calls the given function once
     * for every `interval` bytes in this byte range,
     * passing them in as a new `ByteRange`.  The results
     * are then returned in order as an Array.
     *
     * If only one argument is passed to this method,
     * it should be the callback.  An interval of `1`
     * is then assumed.  Otherwise, the first argument
     * should be the interval, and the second the callback
     * function to apply.
     */
    this.map_every = function(interval, func) {
      var num_bytes = 1;
      var cb = null;
      if (typeof interval == 'number') {
        num_bytes = interval;
        cb = func;
      }
      else {
        cb = interval; // we just got a function, assume an interval of 1
      }

      var res = [];
      var num_slices = Math.floor(this.buff.length/num_bytes);
      for (var i = 0; i < num_slices; i++) {
        var curr_loc = i*num_bytes;
        res.push(cb(ByteRange(this.buff, curr_loc, curr_loc+num_bytes-1)));
      }

      return res;
    };

    /* #### map_each(interval_or_func[, func]) ####
     *
     * An alias for `map_every(interval_or_func[, func])`.
     */
    this.map_each = this.map_every;

    /* #### map_to(func) ####
     *
     * This method creates a new `PacketByteContainer`
     * object for the underlying byte buffer for this
     * ByteRange, passes it to the given function,
     * and returns the result.
     */
    this.map_to = function(func) { return func(PacketByteContainer(this.buff)); };
  };

  /* ### src ###
   *
   * The source byte buffer for this PacketByteContainer.
   */
  this.src = src;

  /* ### bytes([start, end]) ###
   *
   * This method returns a new ByteRange
   * based on the bytes in this
   * PacketByteContainer.  If no start and
   * end value are given, the whole byte
   * buffer is used.
   */
  this.bytes = function(start, end) {
    if (start === end === null) return this.all_bytes();
    return new ByteRange(this.src, start, end);
  };

  /* ### all_bytes() ###
   *
   * A synonym for calling `bytes()`
   * without any arguments.
   */
  this.all_bytes = function() {
      return new ByteRange(this.src, 0, this.src.length - 1);
  };

  this.getBuffer = function () {
    return this.src;
  };

  /* ### this.byte ###
   *
   * This method returns a new ByteRange
   * based on the bytes in this PacketByteContainer
   * for a single byte.
   *
   * It is equivalent to `bytes(start, start)`.
   */
  this.byte = function(start) {
    return new ByteRange(this.src, start, start);
  };
};

/* PacketAssembler
 * ---------------
 *
 * Constructor: function(offset = 0)
 *
 * This class is essentially the inverse of
 * PacketByteContainer; PacketAssembler
 * facilitates the construction of packets.
 * The constructor takes one optional argument:
 * an offset to apply to any byte ranges (i.e.
 * `bytes(x, y)` get written to the instruction
 * queue as `bytes(offset + x, offset + y)`).
 *
 * The class works by building up a list of
 * instruction functions, calculating the required
 * packet length.  Then, once all instructions have
 * been added, the `assemble()` method can be called,
 * which creates a new Buffer, applied the instructions
 * to it, and then returns it.
 */
var PacketAssembler = function (offset) {
  this.length = 0;
  this.instructions = [];
  this.offset = offset || 0;

  this.bytes = function (start, end) {
    return new ByteRange(this, offset + start, offset + end);
  };

  this.byte = function (start) {
    return new ByteRange(this, offset + start, offset + start);
  };

  /* ### ByteRange ###
   *
   * Constructor: function(assembler, start, end)
   *
   * This class is similar to the one in PacketByteContainer,
   * execpt it functions in the reverse direction.  Instead
   * of deserializing ranges of bytes into Javascript values,
   * it leaves instructions in the containing PacketAssembler
   * on how to serialize Javascript values into a set of bytes.
   */
  var ByteRange = function (assemlber, start, end) {
    this.dest = assemlber;
    this.start = start;
    this.end = end;
    Object.defineProperty(this, 'length', { get: function () { return this.end - this.start + 1; } });

    if (this.end + 1 > this.dest.length) this.dest.length = this.end + 1;

    var self = this;

    /* #### fromRawFunc(val, func) ####
     *
     * This method takes a function
     * which should return a function
     * in the format of the data_types
     * serializers.  The returned function
     * will then be appropriately added to
     * the instruction queue.  The function
     * `func` should take a single argument,
     * which will be the current ByteRange
     * object.
     */
    this.fromRawFunc = function (func, val) {
      var resolved_func = func(this);
      this.dest.instructions.push(function (buff) {
        return resolved_func(val, buff, self.start);
      });
    };

    /* #### fromInt(val) ####
     *
     * This method writes a int into
     * to the specified bytes.  It determines
     * the size of integer by examining the length
     * of the current ByteRange.
     */
    this.fromInt = function (val) {
      if (this.length == 1) {
        this.dest.instructions.push(function (buff) {
          return data_types.UInt8.serialize(val, buff, self.start);
        });
      }
      else if (this.length == 2) {
        this.dest.instructions.push(function (buff) {
          return data_types.Int16.serialize(val, buff, self.start);
        });
      }
      else if (this.length == 4) {
        this.dest.instructions.push(function (buff) {
          return data_types.Int32.serialize(val, buff, self.start);
        });
      }
      else throw new Error("Cannot write ints greater than 32 bits in size!");
    };

    /* #### fromString(val) ####
     *
     * This method writes a string into the
     * specified bytes.  The string will be null-terminated
     * (if it is not already -- if it isn't null-terminated, please
     * factor the extra byte into the length of the ByteRange)
     * and will use the null-terminated Bowler
     * string type.
    */
    this.fromString = function(val, fixed_length) {
      this.dest.instructions.push(function (buff) {
        return data_types.NullTerminatedString.serialize(val, buff, self.start);
      });
    };

    /* #### fromBuffer(val) ####
     *
     * This method writes a buffer to the bytes
     * in this ByteRange.  Note that the size of
     * the buffer should be one less than the size
     * of the ByteRange, since the a byte with the
     * length of the buffer is also added.  Note also
     * that this means that the maximum supported buffer
     * length is 255.
     */
    this.fromBuffer = function (val) {
      this.dest.instructions.push(function (buff) {
        return data_types.ByteBuffer.serialize(val, buff, self.start);
      });
    };

    /* #### fromUInt8Array ####
     *
     * This method writes an array of
     * unsigned integers to the bytes in the current
     * ByteRange.  First, a single byte is written
     * as the number of bytes to write, and then
     * the integers are written (note that this
     * means the length of the ByteRange should
     * be the byte-length of the array plus 1).  A typed
     * array may be passed directly.  If a typed array
     * is not passed, one will be created from the input
     * array.
     */
    this.fromUInt8Array = function (val) {
      var ta = val;
      if (!(ta instanceof Uint8Array)) ta = new Uint8Array(val);
      this.dest.instructions.push(function (buff) {
        return data_types.UInt8Array.serialize(ta, buff, self.start);
      });
    };

    /* #### fromInt32Array ####
     *
     * This method writes an array of
     * integers to the bytes in the current
     * ByteRange.  First, a single byte is written
     * as the number of bytes to write, and then
     * the integers are written (note that this
     * means the length of the ByteRange should
     * be the byte-length of the array plus 1).  A typed
     * array may be passed directly.  If a typed array
     * is not passed, one will be created from the input
     * array.
     */
    this.fromInt32Array = function (val) {
      var ta = val;
      if (!(ta instanceof Int32Array)) ta = new Int32Array(val);
      this.dest.instructions.push(function (buff) {
        return data_types.Int32Array.serialize(ta, buff, self.start);
      });
    };

    /* #### fromBool ####
     *
     * This method writes a bool the
     * the first byte of the current
     * ByteRange.  A zero is written
     * for false and a one is written
     * for true.
     */
    this.fromBool = function (val) {
      this.dest.instructions.push(function (buff) {
        return data_types.Bool.serialize(val, buff, self.start);
      });
    };
  };

  /** ### assemble() ###
   *
   * This method executes the instructions in the
   * instruction queue (but does not clear it) on
   * a new Buffer, and returns it.
   */
  this.assemble = function () {
    var buff = new Buffer(this.length);

    instructions.forEach(function (func) {
      func(buff);
    });
    return buff;
  };

  /* ### as_prefix() ###
   *
   * This method returns a new PacketAssembler
   * whose instruction queue contains the same instructions
   * as the current PacketAssembler's instruction queue
   * (in a new Array), and whose current calculated length
   * is that of the current PacketAssembler.
   */
  this.as_prefix = function () {
    var res = new PacketAssembler();
    res.length = this.length;
    for (var i = 0; i < this.instructions.length; i++) {
      res.instructions[i] = this.instructions[1];
    }
    return res;
  };

  /* ### append(PacketAssembler) ###
   *
   * This method appends the instructions of the given
   * PacketAssembler to the current PacketAssembler, setting
   * the length of the current PacketAssembler to the larger
   * of the two.
   */
  this.append = function (assmblr) {
    this.instructions = this.instructions.concat(assmblr.instructions);
    if (this.length < assmblr.length) {
      this.length = assmblr.length;
    }
  };
};

module.exports = {
  PacketByteContainer: PacketByteContainer,
  PacketAssembler: PacketAssembler,
  data_types: data_types
};

var _data_codes_cache = null;

Object.defineProperty(module.exports, 'data_codes', {
  enumerable:true,
  configurable: false,
  get: function () {
    if (!_data_codes_cache) {
      for (var type_name in data_types) {
        _data_codes_cache[data_types[type_name].code] = type_name;
      }
    }
    return _data_codes_cache;
  }
});

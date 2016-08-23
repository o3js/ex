const _ = require('lodash');
const assert = require('sugar').assert;
const LazyStream = require('./stream').LazyStream;

const fromArray = (arr) =>
        (next, error, complete) => {
          error = null;
          _.each(arr, (item) => { next(item); });
          complete();
        };

const fromPromise = (p) =>
        (next, error, complete) => {
          p.then(next, error).then(complete);
        };

const fromStream = (s) => _.bind(s.subscribe, s);

const fromEmitter = (emitter, eventName) =>
        (next) => {
          emitter.on(eventName, next);
        };

const isStream = (thing) =>
        !!(thing && _.isFunction(thing.subscribe));

const makeSourceFn = (thing) => {
  if (_.isArray(thing)) {
    return fromArray(thing);
  }
  if (_.isFunction(thing.on)) {
    return fromEmitter(thing, _.rest(arguments)[0]);
  }
  if (_.isFunction(thing.then)) {
    return fromPromise(thing);
  }
  if (isStream(thing)) {
    return fromStream(thing);
  }
  if (_.isFunction(thing)) {
    return thing;
  }
  if (_.isFunction(thing.onChange)) {
    return (next) => {
      next(thing.value());
      thing.onChange(next);
    };
  }
  assert(
    false,
    'Cannot source a stream from: '
      + JSON.stringify(thing));
  return null;
};

const stream = (thing) => {
  const str = _.isUndefined(thing)
          ? new LazyStream()
          : new LazyStream(makeSourceFn(thing));
  return str;
};


const each = (str, n, e, c) => str.subscribe(n, e, c);

module.exports = { stream, each };

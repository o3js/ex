const _ = require('lodash');
const assert = require('sugar').assert;
const LazyStream = require('./stream').LazyStream;
const GreedyObservable = require('./observable').GreedyObservable;

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

const assertStream = (thing) => {
  assert(isStream(thing), 'Not a stream: ' + JSON.stringify(thing));
};

const assertStreamArray = (thing) => {
  assert(_.isArray(thing), 'Not an array: ' + JSON.stringify(thing));
  _.each(thing, assertStream);
};

const assertStreamProps = (thing) => {
  assert(
    _.isObject(thing),
    'Not an object: ' + JSON.stringify(thing));
  _.each(thing, (val) => {
    assertStream(val);
  });
};

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

const isObservable = (thing) =>
        !!(thing
           && _.isFunction(thing.subscribe)
           && _.isFunction(thing.current));

const assertObservable = (thing) => {
  assert(isObservable(thing), 'Not an observable: ' + JSON.stringify(thing));
};

const assertObservablesArray = (thing) => {
  assert(_.isArray(thing), 'Not an array: ' + JSON.stringify(thing));
  _.each(thing, assertObservable);
};

const assertObservableProps = (thing) => {
  assert(
    _.isObject(thing),
    'Not an object: ' + JSON.stringify(thing));
  _.each(thing, (val) => {
    assertObservable(val);
  });
};

const observable = (arg1, arg2) =>
        new GreedyObservable(arg1, arg2 || stream());

const boundCallback = (str, mapper) => {
  let n;
  str.bind((next) => {
    n = next;
  }, true);
  return (item) => {
    if (n) {
      n(
        _.isFunction(mapper)
          ? mapper(item)
          : (_.isUndefined(mapper)
             ? item
             : mapper));
    }
  };
};

const bind = (str, thing) => (
  thing
    ? str.bind(makeSourceFn(thing), true)
    : boundCallback(str)
);

const each = (str, n, e, c) => str.subscribe(n, e, c);

const map = (str, mapper) => stream((next, error, complete) => {
  each(
    str,
    (item) => { next(mapper(item)); },
    error,
    complete);
});

const adjoinStreams = (strs, tuple) => stream((next, error, complete) => {
  const completed = _.map(strs, () => false);
  _.each(strs, (str, i) => {
    each(
      str,
      (item) => {
        tuple = _.clone(tuple);
        tuple[i] = item;
        next(tuple);
      },
      error,
      () => {
        completed[i] = true;
        if (_.every(completed)) {
          complete();
        }
      });
  });
});

const adjoin = (strs, defaults) => {
  defaults = defaults || _.map(strs, _.noop);
  assertStreamArray(strs);

  if (defaults) assert(_.isArray(defaults),
                       'adjoin takes an array of defaults');
  return adjoinStreams(strs, defaults);
};

const adjoinProps = (strs, defaults) => {
  assertStreamProps(strs);
  if (defaults) assert(_.isPlainObject(defaults),
                       'adjoinProps takes object of defaults');
  defaults = defaults || _.mapValues(strs, _.noop);
  strs = _.mapValues(strs, (val, key) => (
    isStream(val) ? val : adjoinProps(val, defaults && defaults[key])));
  return adjoinStreams(strs, defaults);
};

const streamCast = (thing) => (
  (thing && thing.subscribe) ? thing : stream([thing]));

const s = (fn, ...args) => map(adjoin(_.map(args, streamCast)), _.spread(fn));

const o = (fn, ...args) => observable(null, s(fn, ...args));

_.extend(s, { stream, bind, each });
_.extend(o, { observable });

module.exports = { s, o };

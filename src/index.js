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
    console.log("FROM PROMISE");
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
  assert(!mapper || _.isFunction(mapper),
         'expected a function: ' + JSON.stringify(mapper));
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
    // wasteful array boxing, but the idea is to use the lodash
    // implementation
    (item) => { next(_.map([item], mapper)[0]); },
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

const debounce = (str, ms) => {
  assertStream(str);

  let myTimeout;
  return stream((next, error, complete) => {
    let flushed;
    let completed;
    each(str, (item) => {
      flushed = false;
      if (myTimeout) clearTimeout(myTimeout);
      myTimeout = setTimeout(() => {
        next(item);
        flushed = true;
        if (completed) complete();
      }, ms);
    }, error, () => {
      completed = true;
      if (flushed) complete();
    });
  });
};

const resolve = (str) => {
  assertStream(str);

  let isCompleted = false;
  let unresolved = 0;

  return stream((next, error, complete) => {
    each(str, (item) => {
      unresolved++;
      // TODO:yee:2015-11-24:Order is not preserved
      (item.then
       ? item
       : { then: (fn) => fn(item) }
      ).then(
        (val) => {
          next(val);
          unresolved--;
          if (isCompleted && !unresolved) complete();
        },
        error
      );
    }, error, () => {
      if (!unresolved) complete();
      isCompleted = true;
    });
  });
};

const take = (str, count) => {
  assertStream(str);

  return stream((next, error, complete) => {
    if (count === 0) complete();
    let completed = false;
    let taken = 0;
    const unsubscribe = each(
      str,
      (val) => {
        if (taken >= count) {
          // If firing synchronously we won't have an unsub function yet...
          if (!completed && unsubscribe) {
            completed = true;
            unsubscribe();
            complete();
          }
          return;
        }
        taken++;
        next(val);
      },
      error,
      complete);
  });
};

const skip = (str, count) => {
  assertStream(str);

  return stream((next, error, complete) => {
    if (count === 0) complete();
    let skipped = 0;
    each(
      str,
      (val) => {
        if (skipped < count) skipped++;
        else next(val);
      },
      error,
      complete);
  });
};

const merge = (...strs) => {
  assertStreamArray(strs);
  return stream((next, error, complete) => {
    const completed = _.map(strs, () => false);
    _.each(strs, (str, i) => {
      each(str, next, error, () => {
        completed[i] = true;
        if (_.every(completed)) complete();
      });
    });
  });
};

const head = (str) => take(str, 1);

const tail = (str) => skip(str, 1);

const flatten = (str) => {
  assertStream(str);
  let more = true;
  let openSubStreams = 0;
  return stream((next, error, complete) => {
    each(
      str,
      (item) => {
        if (!isStream(item)) {
          next(item);
        } else {
          openSubStreams++;
          each(item, next, error, () => {
            openSubStreams--;
            if (!openSubStreams && !more) complete();
          });
        }
      },
      error,
      () => {
        more = false;
        if (!openSubStreams && !more) complete();
      });
  });
};

const streamCast = (thing) => (
  (thing && thing.subscribe) ? thing : stream([thing]));

const s = (fn, ...args) => map(adjoin(_.map(args, streamCast)), _.spread(fn));

const o = (fn, ...args) => observable(null, s(fn, ...args));

_.extend(s, {
  stream,
  bind,
  each,
  map,
  debounce,
  resolve,
  take,
  skip,
  head,
  tail,
  merge,
  flatten,
});
_.extend(o, { observable });

module.exports = { s, o };

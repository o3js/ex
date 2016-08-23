const s = require('./stream');

class GreedyObservable {

  constructor(initialValue, stream) {
    const self = this;
    s.assertStream(stream);

    self._currentValue = initialValue;
    self._source = stream;
    s.each(
      stream,
      (item) => { self._currentValue = item; }
    );
  }

  subscribe(next, __, complete) {
    const self = this;
    __ = null;
    return s.each(
      s.changes(s.startWith(self._currentValue, self._source)),
      next,
      null,
      complete);
  }
}

module.exports = { GreedyObservable };

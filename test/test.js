const x = require('../src/index');
const _ = require('lodash');
const expect = require('chai').expect;

module.exports = [
  ['Stream',
   ['from array', () => {
     const s = x.stream([1, 2, 3]);
     const items = [];
     x.each(s, _.bind(items.push, items));
     expect(items).to.eql([1, 2, 3]);
   }],
  ],
];

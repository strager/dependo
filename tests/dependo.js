var dependo = require('..');

var cBuilder = dependo.create();

// %.o: %.c
cBuilder.dep(/^(.*)\.o$/, function (callback, filename, basename) {
    callback(null, [ basename + '.c' ]);
});

// output: module-a.o module-b.o
cBuilder.dep('output', [ 'module-a.o', 'module-b.o' ]);

// all: output
cBuilder.dep('all', [ 'output' ]);

// .PHONY: all
//cBuilder.phony([ 'all' ]);

function record(args) {
    console.log(args);
}

// cc -o $@ $^
cBuilder.when(/^.*\.o$/, function (callback, name) {
    cBuilder.getDeps(name, function (err, deps) {
        if (err) return error(err);

        record([ 'cc', '-o', name ].concat(deps));
    });
});

// ld -o $@ $^
cBuilder.when('output', function (callback, name) {
    cBuilder.getDeps(name, function (err, deps) {
        if (err) return error(err);

        record([ 'ld', '-o', name ].concat(deps));
    });
});

var times = {
    'module-a.c': 800,
    'module-a.o': 1000,

    'module-b.c': 2300,
    'module-b.o': 2000,

    'output': 3000,

    'all': 0
};

function stamp(name, callback) {
    callback(null, times[name]);
}

cBuilder.build('all', stamp);

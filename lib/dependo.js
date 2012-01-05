function getType(obj) {
    switch (obj) {
    case null:
        return 'null';

    case undefined:
        return 'undefined';

    default:
        return Object.prototype.toString.call(obj)
            .replace(/^\[object (.*)\]$/, '$1');
    }
}

// Create `count` callbacks.  If any of those callbacks
// result in an error, `callback` is immediately called with
// the error.  If all of those callbacks are successful,
// `callback` is called with an array of the values.
function fanCallback(callback, count) {
    callback = ensureCallback(callback);
    count = Number(count);

    if (isNaN(count) || !isFinite(count) || count < 0) {
        throw new TypeError("count must be a number");
    }

    // values[1] corresponds to arguments[1] of each in
    // callbacks.  (values[0] is the null err value.)
    var values = [ null ];

    var gotValues = 0;

    function done() {
        callback.apply(null, values);
    }

    function gotValue(index, args) {
        ++gotValues;

        // Merge arguments into `values` (ignoring the err
        // argument)
        var i;
        for (i = 1; i < args.length; ++i) {
            if (!values[i]) {
                values[i] = [ ];
            }
            values[i][index] = args[i];
        }

        if (args[0]) {
            // Error occured; call callback indicating
            // a problem
            values[0] = args[0];
            done();
        } else if (gotValues === count) {
            // All callbacks called; call the master
            // callback indicating success.
            done();
        }
    }

    // Special case: a count of 0 means no callback needs to
    // be called, and the operation was successful.
    if (count === 0) {
        done();
        return [ ];
    }

    var callbacks = [ ];
    var i;
    for (i = 0; i < count; ++i) {
        (function (index) {
            callbacks[index] = function (/* args */) {
                gotValue(index, arguments);
            };
        }(i));
    }

    return callbacks;
}

// Calls `itemCallback` for each in `array` with the array
// item and and a callback.  `doneCallback` is called when
// all `itemCallback` callbacks call the callback pased into
// them.  (Errors return early, as with fanCallback.)
function forEachAsync(array, itemCallback, doneCallback) {
    var callbacks = fanCallback(doneCallback, array.length);
    array.forEach(function (item, i) {
        itemCallback(item, callbacks[i]);
    });
}

// Taken from:
// https://github.com/sibblingz/HTML5-Game-Benchmarks/blob/43295b8401d855f56e11a5f339ee5d1a6cb035a1/js/util/ensureCallback.js
// Modified for Node.js
function ensureCallback(callback) {
    if (typeof callback !== 'function') {
        return function (err) {
            if (err) {
                console.error(err);
            }
        };
    }

    var called = false;
    return function () {
        if (called) {
            // Disallow calling multiple times
            return;
        }

        called = true;
        var args = arguments;

        process.nextTick(function () {
            // Ensure async
            callback.apply(null, args);
        });
    };
};

function dependo() {
    // type Node = String
    // union MultiNode = Node | [MultiNode]
    // union Requirement = Node | [Node] | RequirementFunction
    // union Target = RegExp | Node | [Target]

    // Any -> Bool
    function isValidRequirement(requirement) {
        switch (getType(requirement)) {
        case 'String':
        case 'Function':
            return true;

        case 'Array':
            return requirement.every(function (x) {
                return getType(x) === 'String'
            });

        default:
            return false;
        }
    }

    // (MonadZero m) => Any -> m ()
    function ensureValidRequirement(requirement) {
        if (!isValidRequirement(requirement)) {
            throw new TypeError(
                "Requirement must be a string, an array of strings, or a function" +
                " (got: " + requirement + ")"
            );
        }
    }

    // Any -> Bool
    function isValidTarget(target) {
        switch (getType(target)) {
        case 'RegExp':
        case 'String':
            return true;

        case 'Array':
            return target.every(isValidTarget);

        default:
            return false;
        }
    }

    // (MonadZero m) => Any -> m ()
    function ensureValidTarget(target) {
        if (!isValidTarget(target)) {
            throw new TypeError(
                "Target must be a RegExp, a string, or an array of targets" +
                " (got: " + target + ")"
            );
        }
    }

    // TODO
    function ensureValidBuildStep(_) { }
    function ensureValidNode(_) { }

    // MultiNode -> [Node]
    // i.e. recursive array (or singleton) flatten
    function flattenMultiNode(multiNode) {
        if (!Array.isArray(multiNode)) {
            return [ multiNode ];
        }

        return multiNode.reduce(function (acc, multiNode) {
            return acc.concat(flattenMultiNode(multiNode));
        }, [ ]);
    }

    // [(Target,Requirement)]
    var dependencyGraph = [ ];

    // [Target]
    var phonyTargets = [ ];

    // [(Target,BuildStep)]
    var buildSteps = [ ];

    // Target -> Requirement -> Dependo ()
    function addDependency(target, requirement) {
        ensureValidTarget(target);
        ensureValidRequirement(requirement);

        dependencyGraph.push([ target, requirement ]);
    }

    // Target -> Dependo ()
    function addPhonyTarget(target) {
        ensureValidTarget(target);

        phonyTargets.push(target);
    }

    // Target -> BuildStep -> Dependo ()
    function addBuildStep(target, buildStep) {
        ensureValidTarget(target);
        ensureValidBuildStep(buildStep);

        buildSteps.push([ target, buildStep ]);
    }

    // Target -> Node -> Maybe [String]
    function targetMatchesNode(target, node) {
        node = String(node);

        switch (getType(target)) {
        case 'RegExp':
            return target.exec(node) || null;

        case 'String':
            if (String(target) === node) {
                return [ node ];
            } else {
                return null
            }

        case 'Array':
            return target.reduce(function (acc, target) {
                return acc || targetMatchesNode(target, node) || null;
            }, null);

        default:
            throw new Error("This should never happen");
        }
    }

    // [String] -> Requirement -> Async [Node] -> IO ()
    function resolveRequirement(match, requirement, callback) {
        function safeCallback(err, multiNode) {
            if (err) return callback(err);

            callback(null, flattenMultiNode(multiNode));
        }

        switch (getType(requirement)) {
        case 'String':
            safeCallback(null, [ requirement ]);
            return;

        case 'Function':
            requirement.apply(null, [ safeCallback ].concat(match));
            return;

        case 'Array':
            safeCallback(null, requirement);
            return;

        default:
            throw new Error("This should never happen");
        }
    }

    // Node -> Async [Node] -> Dependo ()
    function getDependencies(node, callback) {
        callback = ensureCallback(callback);

        ensureValidNode(node);

        var getDeps = dependencyGraph.reduce(function (acc, pair) {
            // Find the first match and returns a function
            // which gets the dependencies (async).
            if (acc) return acc;

            var target = pair[0];
            var match = targetMatchesNode(target, node);
            if (match) {
                var requirement = pair[1];
                return resolveRequirement.bind(null, match, requirement);
            }
        }, null);

        if (!getDeps) {
            //return callback(new Error("Could not find a rule for " + node));
            return callback(null, [ ]);
        }

        getDeps(callback);
    }

    // Node -> [Node] -> Stamper -> Async -> Dependo ()
    function handleBuiltDeps(node, deps, stamper, callback) {
        forEachAsync([ node ].concat(deps), stamper, function (err, stamps) {
            if (err) return callback(err);

            var nodeStamp = stamps[0];
            var depsStamps = stamps.slice(1);

            // If any dependencies are newer than
            // the node, execute the node.
            var anyDepNewer = depsStamps.some(function (x) {
                return x > nodeStamp;
            });
            if (anyDepNewer) {
                execute(node, callback);
            } else {
                // Node already built
                callback(null);
            }
        });
    }

    // Node -> Async -> Dependo ()
    function execute(node, callback) {
        // TODO Remove code duplicated with getDependencies

        var exec = buildSteps.reduce(function (acc, pair) {
            // Find the first match and returns a function
            // which executes the build steps (async).
            if (acc) return acc;

            var target = pair[0];
            var match = targetMatchesNode(target, node);
            if (match) {
                var buildStep = pair[1];
                return function (callback) {
                    buildStep.apply(null, [ callback ].concat(match));
                };
            }
        }, null);

        if (!exec) {
            return callback(new Error("Could not find build step for " + node));
        }

        exec(callback);
    }

    // Stamper -> Node -> Async -> Dependo ()
    // For internal use only
    // MultiNode -> Stamper -> Async -> Dependo ()
    function build(multiNode, stamper, callback) {
        callback = ensureCallback(callback);

        var nodes = flattenMultiNode(multiNode);
        forEachAsync(nodes, buildOne, callback);

        return;

        function buildOne(node, callback) {
            // callback ensured to be a function

            // Depth-first recurse of buildOne
            getDependencies(node, function (err, deps) {
                if (err) return callback(err);

                forEachAsync(deps, buildOne, function (err) {
                    if (err) return callback(err);

                    handleBuiltDeps(node, deps, stamper, callback);
                });
            });

            return;
        }
    }

    return {
        dep: addDependency,
        phony: addPhonyTarget,
        when: addBuildStep,
        build: build,

        getDeps: getDependencies
    };
}

exports.create = dependo;

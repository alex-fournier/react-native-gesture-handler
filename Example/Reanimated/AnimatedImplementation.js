const { AnimatedEvent, attachNativeEvent } = require('./AnimatedEvent');
const AnimatedCond = require('./nodes/AnimatedCond');
const AnimatedSet = require('./nodes/AnimatedSet');
const AnimatedInterpolation = require('./nodes/AnimatedInterpolation');
const AnimatedOp = require('./nodes/AnimatedOp');
const AnimatedOnChange = require('./nodes/AnimatedOnChange');
const AnimatedNode = require('./nodes/AnimatedNode');
const AnimatedProps = require('./nodes/AnimatedProps');
const AnimatedTracking = require('./nodes/AnimatedTracking');
const AnimatedValue = require('./nodes/AnimatedValue');
const AnimatedValueXY = require('./nodes/AnimatedValueXY');
const DecayAnimation = require('./animations/DecayAnimation');
const SpringAnimation = require('./animations/SpringAnimation');
const TimingAnimation = require('./animations/TimingAnimation');

const createAnimatedComponent = require('./createAnimatedComponent');

const add = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a + b);
};

const divide = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a / b);
};

const multiply = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a * b);
};

const set = function(what, value) {
  return new AnimatedSet(what, value);
};

const cond = function(cond, ifBlock, elseBlock) {
  return new AnimatedCond(cond, ifBlock, elseBlock);
};

const eq = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a === b);
};

const lessThan = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a < b);
};

const defined = function(v) {
  return new AnimatedOp(
    [v],
    ([v]) => v !== null && v !== undefined && !isNaN(v)
  );
};

const or = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a || b);
};

const and = function(a, b) {
  return new AnimatedOp([a, b], ([a, b]) => a && b);
};

const block = function(items) {
  return new AnimatedOp(items, values => values[values.length - 1]);
};

const call = function(items, func) {
  return new AnimatedOp(items, values => func(values) && 0);
};

const modulo = function(a, modulus) {
  return new AnimatedOp([a, modulus], ([a, b]) => (a % b + b) % b);
};

const onChange = function(value, action) {
  return new AnimatedOnChange(value, action);
};

const min = function(a, b) {
  return cond(lessThan(a, b), a, b);
};

const max = function(a, b) {
  return cond(lessThan(a, b), b, a);
};

const diff = function(v) {
  const stash = new AnimatedValue(0);
  const prev = new AnimatedValue();
  return block([
    set(stash, cond(defined(prev), add(v, multiply(-1, prev)), 0)),
    set(prev, v),
    stash,
  ]);
};

const acc = function(v) {
  const acc = new AnimatedValue(0);
  return set(acc, add(acc, v));
};

const diffClamp = function(a, minVal, maxVal) {
  const value = new AnimatedValue();
  return set(
    value,
    min(max(add(cond(defined(value), value, a), diff(a)), minVal), maxVal)
  );
};

const _combineCallbacks = function(callback, config) {
  if (callback && config.onComplete) {
    return (...args) => {
      config.onComplete && config.onComplete(...args);
      callback && callback(...args);
    };
  } else {
    return callback || config.onComplete;
  }
};

const maybeVectorAnim = function(value, config, anim) {
  if (value instanceof AnimatedValueXY) {
    const configX = { ...config };
    const configY = { ...config };
    for (const key in config) {
      const { x, y } = config[key];
      if (x !== undefined && y !== undefined) {
        configX[key] = x;
        configY[key] = y;
      }
    }
    const aX = anim(value.x, configX);
    const aY = anim(value.y, configY);
    // We use `stopTogether: false` here because otherwise tracking will break
    // because the second animation will get stopped before it can update.
    return parallel([aX, aY], { stopTogether: false });
  }
  return null;
};

const spring = function(value, config) {
  const start = function(animatedValue, configuration, callback) {
    callback = _combineCallbacks(callback, configuration);
    const singleValue = animatedValue;
    const singleConfig = configuration;
    singleValue.stopTracking();
    if (configuration.toValue instanceof AnimatedNode) {
      singleValue.track(
        new AnimatedTracking(
          singleValue,
          configuration.toValue,
          SpringAnimation,
          singleConfig,
          callback
        )
      );
    } else {
      singleValue.animate(new SpringAnimation(singleConfig), callback);
    }
  };
  return (
    maybeVectorAnim(value, config, spring) || {
      start: function(callback) {
        start(value, config, callback);
      },

      stop: function() {
        value.stopAnimation();
      },

      reset: function() {
        value.resetAnimation();
      },

      _startNativeLoop: function(iterations) {
        const singleConfig = { ...config, iterations };
        start(value, singleConfig);
      },

      _isUsingNativeDriver: function() {
        return config.useNativeDriver || false;
      },
    }
  );
};

const timing = function(value, config) {
  const start = function(animatedValue, configuration, callback) {
    callback = _combineCallbacks(callback, configuration);
    const singleValue = animatedValue;
    const singleConfig = configuration;
    singleValue.stopTracking();
    if (configuration.toValue instanceof AnimatedNode) {
      singleValue.track(
        new AnimatedTracking(
          singleValue,
          configuration.toValue,
          TimingAnimation,
          singleConfig,
          callback
        )
      );
    } else {
      singleValue.animate(new TimingAnimation(singleConfig), callback);
    }
  };

  return (
    maybeVectorAnim(value, config, timing) || {
      start: function(callback) {
        start(value, config, callback);
      },

      stop: function() {
        value.stopAnimation();
      },

      reset: function() {
        value.resetAnimation();
      },

      _startNativeLoop: function(iterations) {
        const singleConfig = { ...config, iterations };
        start(value, singleConfig);
      },

      _isUsingNativeDriver: function() {
        return config.useNativeDriver || false;
      },
    }
  );
};

const decay = function(value, config) {
  const start = function(animatedValue, configuration, callback) {
    callback = _combineCallbacks(callback, configuration);
    const singleValue = animatedValue;
    const singleConfig = configuration;
    singleValue.stopTracking();
    singleValue.animate(new DecayAnimation(singleConfig), callback);
  };

  return (
    maybeVectorAnim(value, config, decay) || {
      start: function(callback) {
        start(value, config, callback);
      },

      stop: function() {
        value.stopAnimation();
      },

      reset: function() {
        value.resetAnimation();
      },

      _startNativeLoop: function(iterations) {
        const singleConfig = { ...config, iterations };
        start(value, singleConfig);
      },

      _isUsingNativeDriver: function() {
        return config.useNativeDriver || false;
      },
    }
  );
};

const sequence = function(animations) {
  let current = 0;
  return {
    start: function(callback) {
      const onComplete = function(result) {
        if (!result.finished) {
          callback && callback(result);
          return;
        }

        current++;

        if (current === animations.length) {
          callback && callback(result);
          return;
        }

        animations[current].start(onComplete);
      };

      if (animations.length === 0) {
        callback && callback({ finished: true });
      } else {
        animations[current].start(onComplete);
      }
    },

    stop: function() {
      if (current < animations.length) {
        animations[current].stop();
      }
    },

    reset: function() {
      animations.forEach((animation, idx) => {
        if (idx <= current) {
          animation.reset();
        }
      });
      current = 0;
    },

    _startNativeLoop: function() {
      throw new Error(
        'Loops run using the native driver cannot contain Animated.sequence animations'
      );
    },

    _isUsingNativeDriver: function() {
      return false;
    },
  };
};

const parallel = function(animations, config) {
  let doneCount = 0;
  // Make sure we only call stop() at most once for each animation
  const hasEnded = {};
  const stopTogether = !(config && config.stopTogether === false);

  const result = {
    start: function(callback) {
      if (doneCount === animations.length) {
        callback && callback({ finished: true });
        return;
      }

      animations.forEach((animation, idx) => {
        const cb = function(endResult) {
          hasEnded[idx] = true;
          doneCount++;
          if (doneCount === animations.length) {
            doneCount = 0;
            callback && callback(endResult);
            return;
          }

          if (!endResult.finished && stopTogether) {
            result.stop();
          }
        };

        if (!animation) {
          cb({ finished: true });
        } else {
          animation.start(cb);
        }
      });
    },

    stop: function() {
      animations.forEach((animation, idx) => {
        !hasEnded[idx] && animation.stop();
        hasEnded[idx] = true;
      });
    },

    reset: function() {
      animations.forEach((animation, idx) => {
        animation.reset();
        hasEnded[idx] = false;
        doneCount = 0;
      });
    },

    _startNativeLoop: function() {
      throw new Error(
        'Loops run using the native driver cannot contain Animated.parallel animations'
      );
    },

    _isUsingNativeDriver: function() {
      return false;
    },
  };

  return result;
};

const delay = function(time) {
  // Would be nice to make a specialized implementation
  return timing(new AnimatedValue(0), { toValue: 0, delay: time, duration: 0 });
};

const stagger = function(time, animations) {
  return parallel(
    animations.map((animation, i) => {
      return sequence([delay(time * i), animation]);
    })
  );
};

const loop = function(animation, { iterations = -1 } = {}) {
  let isFinished = false;
  let iterationsSoFar = 0;
  return {
    start: function(callback) {
      const restart = function(result = { finished: true }) {
        if (
          isFinished ||
          iterationsSoFar === iterations ||
          result.finished === false
        ) {
          callback && callback(result);
        } else {
          iterationsSoFar++;
          animation.reset();
          animation.start(restart);
        }
      };
      if (!animation || iterations === 0) {
        callback && callback({ finished: true });
      } else {
        if (animation._isUsingNativeDriver()) {
          animation._startNativeLoop(iterations);
        } else {
          restart(); // Start looping recursively on the js thread
        }
      }
    },

    stop: function() {
      isFinished = true;
      animation.stop();
    },

    reset: function() {
      iterationsSoFar = 0;
      isFinished = false;
      animation.reset();
    },

    _startNativeLoop: function() {
      throw new Error(
        'Loops run using the native driver cannot contain Animated.loop animations'
      );
    },

    _isUsingNativeDriver: function() {
      return animation._isUsingNativeDriver();
    },
  };
};

function forkEvent(event, listener) {
  if (!event) {
    return listener;
  } else if (event instanceof AnimatedEvent) {
    event.__addListener(listener);
    return event;
  } else {
    return (...args) => {
      typeof event === 'function' && event(...args);
      listener(...args);
    };
  }
}

function unforkEvent(event, listener) {
  if (event && event instanceof AnimatedEvent) {
    event.__removeListener(listener);
  }
}

const event = function(argMapping, config) {
  const animatedEvent = new AnimatedEvent(argMapping, config);
  if (animatedEvent.__isNative) {
    return animatedEvent;
  } else {
    return animatedEvent.__getHandler();
  }
};

/**
 * The `Animated` library is designed to make animations fluid, powerful, and
 * easy to build and maintain. `Animated` focuses on declarative relationships
 * between inputs and outputs, with configurable transforms in between, and
 * simple `start`/`stop` methods to control time-based animation execution.
 *
 * See http://facebook.github.io/react-native/docs/animated.html
 */
module.exports = {
  /**
   * Standard value class for driving animations.  Typically initialized with
   * `new Animated.Value(0);`
   *
   * See http://facebook.github.io/react-native/docs/animated.html#value
   */
  Value: AnimatedValue,
  /**
   * 2D value class for driving 2D animations, such as pan gestures.
   *
   * See https://facebook.github.io/react-native/releases/next/docs/animatedvaluexy.html
   */
  ValueXY: AnimatedValueXY,
  /**
   * Exported to use the Interpolation type in flow.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#interpolation
   */
  Interpolation: AnimatedInterpolation,
  /**
   * Exported for ease of type checking. All animated values derive from this
   * class.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#node
   */
  Node: AnimatedNode,

  /**
   * Animates a value from an initial velocity to zero based on a decay
   * coefficient.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#decay
   */
  decay,
  /**
   * Animates a value along a timed easing curve. The Easing module has tons of
   * predefined curves, or you can use your own function.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#timing
   */
  timing,
  /**
   * Animates a value according to an analytical spring model based on
   * damped harmonic oscillation.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#spring
   */
  spring,

  /**
   * Creates a new Animated value composed from two Animated values added
   * together.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#add
   */
  add,

  cond,
  block,
  set,
  lessThan,
  eq,
  or,
  and,
  onChange,
  call,
  min,
  max,
  diff,
  defined,
  acc,

  /**
   * Creates a new Animated value composed by dividing the first Animated value
   * by the second Animated value.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#divide
   */
  divide,

  /**
   * Creates a new Animated value composed from two Animated values multiplied
   * together.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#multiply
   */
  multiply,

  /**
   * Creates a new Animated value that is the (non-negative) modulo of the
   * provided Animated value.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#modulo
   */
  modulo,

  /**
   * Create a new Animated value that is limited between 2 values. It uses the
   * difference between the last value so even if the value is far from the
   * bounds it will start changing when the value starts getting closer again.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#diffclamp
   */
  diffClamp,

  /**
   * Starts an animation after the given delay.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#delay
   */
  delay,
  /**
   * Starts an array of animations in order, waiting for each to complete
   * before starting the next. If the current running animation is stopped, no
   * following animations will be started.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#sequence
   */
  sequence,
  /**
   * Starts an array of animations all at the same time. By default, if one
   * of the animations is stopped, they will all be stopped. You can override
   * this with the `stopTogether` flag.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#parallel
   */
  parallel,
  /**
   * Array of animations may run in parallel (overlap), but are started in
   * sequence with successive delays.  Nice for doing trailing effects.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#stagger
   */
  stagger,
  /**
   * Loops a given animation continuously, so that each time it reaches the
   * end, it resets and begins again from the start.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#loop
   */
  loop,

  /**
   * Takes an array of mappings and extracts values from each arg accordingly,
   * then calls `setValue` on the mapped outputs.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#event
   */
  event,

  /**
   * Make any React component Animatable.  Used to create `Animated.View`, etc.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#createanimatedcomponent
   */
  createAnimatedComponent,

  /**
   * Imperative API to attach an animated value to an event on a view. Prefer
   * using `Animated.event` with `useNativeDrive: true` if possible.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#attachnativeevent
   */
  attachNativeEvent,

  /**
   * Advanced imperative API for snooping on animated events that are passed in
   * through props. Use values directly where possible.
   *
   * See http://facebook.github.io/react-native/docs/animated.html#forkevent
   */
  forkEvent,
  unforkEvent,

  __PropsOnlyForTests: AnimatedProps,
};
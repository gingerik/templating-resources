import * as LogManager from 'aurelia-logging';
import {inject,Container} from 'aurelia-dependency-injection';
import {BoundViewFactory,ViewSlot,customAttribute,templateController,Animator,useView,customElement,bindable,ViewResources,resource,ViewCompileInstruction,CompositionEngine,noView,View,TargetInstruction,ViewEngine} from 'aurelia-templating';
import {createOverrideContext,bindingMode,EventManager,BindingBehavior,ValueConverter,sourceContext,mergeSplice,valueConverter,ObserverLocator} from 'aurelia-binding';
import {DOM,FEATURE} from 'aurelia-pal';
import {TaskQueue} from 'aurelia-task-queue';
import {Loader} from 'aurelia-loader';
import {relativeToFile} from 'aurelia-path';

/**
* Creates a binding context for decandant elements to bind to.
*/
@customAttribute('with')
@templateController
@inject(BoundViewFactory, ViewSlot)
export class With {
  /**
  * Creates an instance of With.
  * @param viewFactory The factory generating the view.
  * @param viewSlot The slot the view is injected in to.
  */
  constructor(viewFactory, viewSlot) {
    this.viewFactory = viewFactory;
    this.viewSlot = viewSlot;
    this.parentOverrideContext = null;
    this.view = null;
  }

  /**
  * Binds the With with provided binding context and override context.
  * @param bindingContext The binding context.
  * @param overrideContext An override context for binding.
  */
  bind(bindingContext, overrideContext) {
    this.parentOverrideContext = overrideContext;
    this.valueChanged(this.value);
  }

  /**
  * Invoked everytime the bound value changes.
  * @param newValue The new value.
  */
  valueChanged(newValue) {
    let overrideContext = createOverrideContext(newValue, this.parentOverrideContext);
    if (!this.view) {
      this.view = this.viewFactory.create();
      this.view.bind(newValue, overrideContext);
      this.viewSlot.add(this.view);
    } else {
      this.view.bind(newValue, overrideContext);
    }
  }

  /**
  * Unbinds With
  */
  unbind() {
    this.parentOverrideContext = null;

    if (this.view) {
      this.view.unbind();
    }
  }
}

/**
* Attribute to be placed on any HTML element in a view to emit the View instance
* to the debug console, giving you insight into the live View instance, including
* all child views, live bindings, behaviors and more.
*/
@customAttribute('view-spy')
export class ViewSpy {
  /**
  * Creates a new instance of ViewSpy.
  */
  constructor() {
    this.logger = LogManager.getLogger('view-spy');
  }

  _log(lifecycleName, context) {
    if (!this.value && lifecycleName === 'created' ) {
      this.logger.info(lifecycleName, this.view);
    } else if (this.value && this.value.indexOf(lifecycleName) !== -1) {
      this.logger.info(lifecycleName, this.view, context);
    }
  }

  /**
  * Invoked when the target view is created.
  * @param view The target view.
  */
  created(view) {
    this.view = view;
    this._log('created');
  }

  /**
  * Invoked when the target view is bound.
  * @param bindingContext The target view's binding context.
  */
  bind(bindingContext) {
    this._log('bind', bindingContext);
  }

  /**
  * Invoked when the target element is attached to the DOM.
  */
  attached() {
    this._log('attached');
  }

  /**
  * Invoked when the target element is detached from the DOM.
  */
  detached() {
    this._log('detached');
  }

  /**
  * Invoked when the target element is unbound.
  */
  unbind() {
    this._log('unbind');
  }
}

const eventNamesRequired = `The updateTrigger binding behavior requires at least one event name argument: eg <input value.bind="firstName & updateTrigger:'blur'">`;
const notApplicableMessage = `The updateTrigger binding behavior can only be applied to two-way bindings on input/select elements.`;

export class UpdateTriggerBindingBehavior {
  static inject = [EventManager];

  constructor(eventManager) {
    this.eventManager = eventManager;
  }

  bind(binding, source, ...events) {
    if (events.length === 0) {
      throw new Error(eventNamesRequired);
    }
    if (binding.mode !== bindingMode.twoWay) {
      throw new Error(notApplicableMessage);
    }

    // ensure the binding's target observer has been set.
    let targetObserver = binding.observerLocator.getObserver(binding.target, binding.targetProperty);
    if (!targetObserver.handler) {
      throw new Error(notApplicableMessage);
    }
    binding.targetObserver = targetObserver;

    // stash the original element subscribe function.
    targetObserver.originalHandler = binding.targetObserver.handler;

    // replace the element subscribe function with one that uses the correct events.
    let handler = this.eventManager.createElementHandler(events);
    targetObserver.handler = handler;
  }

  unbind(binding, source) {
    // restore the state of the binding.
    binding.targetObserver.handler = binding.targetObserver.originalHandler;
    binding.targetObserver.originalHandler = null;
  }
}

function throttle(newValue) {
  let state = this.throttleState;
  let elapsed = +new Date() - state.last;
  if (elapsed >= state.delay) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
    state.last = +new Date();
    this.throttledMethod(newValue);
    return;
  }
  state.newValue = newValue;
  if (state.timeoutId === null) {
    state.timeoutId = setTimeout(
      () => {
        state.timeoutId = null;
        state.last = +new Date();
        this.throttledMethod(state.newValue);
      },
      state.delay - elapsed);
  }
}

export class ThrottleBindingBehavior {
  bind(binding, source, delay = 200) {
    // determine which method to throttle.
    let methodToThrottle = 'updateTarget'; // one-way bindings or interpolation bindings
    if (binding.callSource) {
      methodToThrottle = 'callSource';     // listener and call bindings
    } else if (binding.updateSource && binding.mode === bindingMode.twoWay) {
      methodToThrottle = 'updateSource';   // two-way bindings
    }

    // stash the original method and it's name.
    // note: a generic name like "originalMethod" is not used to avoid collisions
    // with other binding behavior types.
    binding.throttledMethod = binding[methodToThrottle];
    binding.throttledMethod.originalName = methodToThrottle;

    // replace the original method with the throttling version.
    binding[methodToThrottle] = throttle;

    // create the throttle state.
    binding.throttleState = {
      delay: delay,
      last: 0,
      timeoutId: null
    };
  }

  unbind(binding, source) {
    // restore the state of the binding.
    let methodToRestore = binding.throttledMethod.originalName;
    binding[methodToRestore] = binding.throttledMethod;
    binding.throttledMethod = null;
    clearTimeout(binding.throttleState.timeoutId);
    binding.throttleState = null;
  }
}

/**
* Binding to conditionally show markup in the DOM based on the value.
* - different from "if" in that the markup is still added to the DOM, simply not shown.
*/
@customAttribute('show')
@inject(DOM.Element, Animator)
export class Show {
  /**
  * Creates a new instance of Show.
  * @param element Target element to conditionally show.
  * @param animator The animator that conditionally adds or removes the aurelia-hide css class.
  */
  constructor(element, animator) {
    this.element = element;
    this.animator = animator;
  }

  /**
  * Invoked everytime the bound value changes.
  * @param newValue The new value.
  */
  valueChanged(newValue) {
    if (newValue) {
      this.animator.removeClass(this.element, 'aurelia-hide');
    } else {
      this.animator.addClass(this.element, 'aurelia-hide');
    }
  }

  /**
  * Binds the Show attribute.
  */
  bind(bindingContext) {
    this.valueChanged(this.value);
  }
}

/**
* Marks any part of a view to be replacable by the consumer.
*/
@customAttribute('replaceable')
@templateController
@inject(BoundViewFactory, ViewSlot)
export class Replaceable {

  /**
  * @param viewFactory target The factory generating the view.
  * @param viewSlot viewSlot The slot the view is injected in to.
  */
  constructor(viewFactory, viewSlot) {
    this.viewFactory = viewFactory; //This is referenced internally in the Controller's bind method.
    this.viewSlot = viewSlot;
    this.view = null;
  }

  /**
  * Binds the replaceable to the binding context and override context.
  * @param bindingContext The binding context.
  * @param overrideContext An override context for binding.
  */
  bind(bindingContext, overrideContext) {
    if (this.view === null) {
      this.view = this.viewFactory.create();
      this.viewSlot.add(this.view);
    }

    this.view.bind(bindingContext, overrideContext);
  }

  /**
  * Unbinds the replaceable.
  */
  unbind() {
    this.view.unbind();
  }
}

const oneTime = bindingMode.oneTime;

/**
* Update the override context.
* @param startIndex index in collection where to start updating.
*/
export function updateOverrideContexts(views, startIndex) {
  let length = views.length;

  if (startIndex > 0) {
    startIndex = startIndex - 1;
  }

  for (; startIndex < length; ++startIndex) {
    updateOverrideContext(views[startIndex].overrideContext, startIndex, length);
  }
}

/**
  * Creates a complete override context.
  * @param data The item's value.
  * @param index The item's index.
  * @param length The collections total length.
  * @param key The key in a key/value pair.
  */
export function createFullOverrideContext(repeat, data, index, length, key) {
  let bindingContext = {};
  let overrideContext = createOverrideContext(bindingContext, repeat.scope.overrideContext);
  // is key/value pair (Map)
  if (typeof key !== 'undefined') {
    bindingContext[repeat.key] = key;
    bindingContext[repeat.value] = data;
  } else {
    bindingContext[repeat.local] = data;
  }
  updateOverrideContext(overrideContext, index, length);
  return overrideContext;
}

/**
* Updates the override context.
* @param context The context to be updated.
* @param index The context's index.
* @param length The collection's length.
*/
export function updateOverrideContext(overrideContext, index, length) {
  let first = (index === 0);
  let last = (index === length - 1);
  let even = index % 2 === 0;

  overrideContext.$index = index;
  overrideContext.$first = first;
  overrideContext.$last = last;
  overrideContext.$middle = !(first || last);
  overrideContext.$odd = !even;
  overrideContext.$even = even;
}

/**
* Gets a repeat instruction's source expression.
*/
export function getItemsSourceExpression(instruction, attrName) {
  return instruction.behaviorInstructions
    .filter(bi => bi.originalAttrName === attrName)[0]
    .attributes
    .items
    .sourceExpression;
}

/**
* Unwraps an expression to expose the inner, pre-converted / behavior-free expression.
*/
export function unwrapExpression(expression) {
  let unwrapped = false;
  while (expression instanceof BindingBehavior) {
    expression = expression.expression;
  }
  while (expression instanceof ValueConverter) {
    expression = expression.expression;
    unwrapped = true;
  }
  return unwrapped ? expression : null;
}

/**
* Returns whether an expression has the OneTimeBindingBehavior applied.
*/
export function isOneTime(expression) {
  while (expression instanceof BindingBehavior) {
    if (expression.name === 'oneTime') {
      return true;
    }
    expression = expression.expression;
  }
  return false;
}

/**
* Forces a binding instance to reevaluate.
*/
export function updateOneTimeBinding(binding) {
  if (binding.call && binding.mode === oneTime) {
    binding.call(sourceContext);
  } else if (binding.updateOneTimeBindings) {
    binding.updateOneTimeBindings();
  }
}

/**
* A strategy for repeating a template over null or undefined (does nothing)
*/
export class NullRepeatStrategy {
  instanceChanged(repeat, items) {
    repeat.viewSlot.removeAll(true);
  }

  getCollectionObserver(observerLocator, items) {
  }
}

/**
* Binding to conditionally include or not include template logic depending on returned result
* - value should be Boolean or will be treated as such (truthy / falsey)
*/
@customAttribute('if')
@templateController
@inject(BoundViewFactory, ViewSlot, TaskQueue)
export class If {
  /**
  * Creates an instance of If.
  * @param {BoundViewFactory} viewFactory The factory generating the view
  * @param {ViewSlot} viewSlot The slot the view is injected in to
  * @param {TaskQueue} taskQueue
  */
  constructor(viewFactory, viewSlot, taskQueue) {
    this.viewFactory = viewFactory;
    this.viewSlot = viewSlot;
    this.showing = false;
    this.taskQueue = taskQueue;
    this.view = null;
    this.bindingContext = null;
    this.overrideContext = null;
  }

  /**
  * Binds the if to the binding context and override context
  * @param bindingContext The binding context
  * @param overrideContext An override context for binding.
  */
  bind(bindingContext, overrideContext) {
    // Store parent bindingContext, so we can pass it down
    this.bindingContext = bindingContext;
    this.overrideContext = overrideContext;
    this.valueChanged(this.value);
  }

  /**
  * Invoked everytime value property changes.
  * @param newValue The new value
  */
  valueChanged(newValue) {
    if (!newValue) {
      if (this.view !== null && this.showing) {
        this.taskQueue.queueMicroTask(() => {
          let viewOrPromise = this.viewSlot.remove(this.view);
          if (viewOrPromise instanceof Promise) {
            viewOrPromise.then(() => this.view.unbind());
          } else {
            this.view.unbind();
          }
        });
      }

      this.showing = false;
      return;
    }

    if (this.view === null) {
      this.view = this.viewFactory.create();
    }

    if (!this.view.isBound) {
      this.view.bind(this.bindingContext, this.overrideContext);
    }

    if (!this.showing) {
      this.showing = true;
      this.viewSlot.add(this.view);
    }
  }

  /**
  * Unbinds the if
  */
  unbind() {
    if (this.view === null) {
      return;
    }

    this.view.unbind();

    if (!this.viewFactory.isCaching) {
      return;
    }

    if (this.showing) {
      this.showing = false;
      this.viewSlot.remove(this.view, true, true);
    }
    this.view.returnToCache();
    this.view = null;
  }
}

const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

/**
* Default Html Sanitizer to prevent script injection.
*/
export class HTMLSanitizer {
  /**
  * Sanitizes the provided input.
  * @param input The input to be sanitized.
  */
  sanitize(input) {
    return input.replace(SCRIPT_REGEX, '');
  }
}

/**
* Binding to conditionally show markup in the DOM based on the value.
* - different from "if" in that the markup is still added to the DOM, simply not shown.
*/
@customAttribute('hide')
@inject(DOM.Element, Animator)
export class Hide {
  /**
  * Creates a new instance of Hide.
  * @param element Target element to conditionally hide.
  * @param animator The animator that conditionally adds or removes the aurelia-hide css class.
  */
  constructor(element, animator) {
    this.element = element;
    this.animator = animator;
  }

  /**
  * Invoked everytime the bound value changes.
  * @param newValue The new value.
  */
  valueChanged(newValue) {
    if (newValue) {
      this.animator.addClass(this.element, 'aurelia-hide');
    } else {
      this.animator.removeClass(this.element, 'aurelia-hide');
    }
  }

  /**
  * Binds the Hide attribute.
  */
  bind(bindingContext) {
    this.valueChanged(this.value);
  }
}

/**
* CustomAttribute that binds provided DOM element's focus attribute with a property on the viewmodel.
*/
@customAttribute('focus', bindingMode.twoWay)
@inject(DOM.Element, TaskQueue)
export class Focus {
  /**
  * Creates an instance of Focus.
  * @paramelement Target element on where attribute is placed on.
  * @param taskQueue The TaskQueue instance.
  */
  constructor(element, taskQueue) {
    this.element = element;
    this.taskQueue = taskQueue;

    this.focusListener = e => {
      this.value = true;
    };
    this.blurListener = e => {
      if (DOM.activeElement !== this.element) {
        this.value = false;
      }
    };
  }

  /**
  * Invoked everytime the bound value changes.
  * @param newValue The new value.
  */
  valueChanged(newValue) {
    if (newValue) {
      this._giveFocus();
    } else {
      this.element.blur();
    }
  }

  _giveFocus() {
    this.taskQueue.queueMicroTask(() => {
      if (this.value) {
        this.element.focus();
      }
    });
  }

  /**
  * Invoked when the attribute is attached to the DOM.
  */
  attached() {
    this.element.addEventListener('focus', this.focusListener);
    this.element.addEventListener('blur', this.blurListener);
  }

  /**
  * Invoked when the attribute is detached from the DOM.
  */
  detached() {
    this.element.removeEventListener('focus', this.focusListener);
    this.element.removeEventListener('blur', this.blurListener);
  }
}

/*eslint padded-blocks:0*/
export function _createDynamicElement(name: string, viewUrl: string, bindableNames: string[]): Function {
  @customElement(name)
  @useView(viewUrl)
  class DynamicElement {
    bind(bindingContext) {
      this.$parent = bindingContext;
    }
  }
  for (let i = 0, ii = bindableNames.length; i < ii; ++i) {
    bindable(bindableNames[i])(DynamicElement);
  }
  return DynamicElement;
}

function debounce(newValue) {
  let state = this.debounceState;
  if (state.immediate) {
    state.immediate = false;
    this.debouncedMethod(newValue);
    return;
  }
  clearTimeout(state.timeoutId);
  state.timeoutId = setTimeout(
    () => this.debouncedMethod(newValue),
    state.delay);
}

export class DebounceBindingBehavior {
  bind(binding, source, delay = 200) {
    // determine which method to debounce.
    let methodToDebounce = 'updateTarget'; // one-way bindings or interpolation bindings
    if (binding.callSource) {
      methodToDebounce = 'callSource';     // listener and call bindings
    } else if (binding.updateSource && binding.mode === bindingMode.twoWay) {
      methodToDebounce = 'updateSource';   // two-way bindings
    }

    // stash the original method and it's name.
    // note: a generic name like "originalMethod" is not used to avoid collisions
    // with other binding behavior types.
    binding.debouncedMethod = binding[methodToDebounce];
    binding.debouncedMethod.originalName = methodToDebounce;

    // replace the original method with the debouncing version.
    binding[methodToDebounce] = debounce;

    // create the debounce state.
    binding.debounceState = {
      delay: delay,
      timeoutId: null,
      immediate: methodToDebounce === 'updateTarget' // should not delay initial target update that occurs during bind.
    };
  }

  unbind(binding, source) {
    // restore the state of the binding.
    let methodToRestore = binding.debouncedMethod.originalName;
    binding[methodToRestore] = binding.debouncedMethod;
    binding.debouncedMethod = null;
    clearTimeout(binding.debounceState.timeoutId);
    binding.debounceState = null;
  }
}

/*eslint new-cap:0, padded-blocks:0*/
let cssUrlMatcher = /url\((?!['"]data)([^)]+)\)/gi;

function fixupCSSUrls(address, css) {
  return css.replace(cssUrlMatcher, (match, p1) => {
    let quote = p1.charAt(0);
    if (quote === '\'' || quote === '"') {
      p1 = p1.substr(1, p1.length - 2);
    }
    return 'url(\'' + relativeToFile(p1, address) + '\')';
  });
}

class CSSResource {
  constructor(address: string) {
    this.address = address;
    this._global = null;
    this._scoped = null;
  }

  initialize(container: Container, target: Function): void {
    this._global = new target('global');
    this._scoped = new target('scoped');
  }

  register(registry: ViewResources, name?: string): void {
    registry.registerViewEngineHooks(name === 'scoped' ? this._scoped : this._global);
  }

  load(container: Container): Promise<CSSResource> {
    return container.get(Loader).loadText(this.address).then(text => {
      text = fixupCSSUrls(this.address, text);
      this._global.css = text;
      this._scoped.css = text;
    });
  }
}

class CSSViewEngineHooks {
  constructor(mode: string) {
    this.mode = mode;
    this.css = null;
    this._alreadyGloballyInjected = false;
  }

  beforeCompile(content: DocumentFragment, resources: ViewResources, instruction: ViewCompileInstruction): void {
    if (this.mode === 'scoped') {
      if (instruction.targetShadowDOM) {
        DOM.injectStyles(this.css, content, true);
      } else if (FEATURE.scopedCSS) {
        let styleNode = DOM.injectStyles(this.css, content, true);
        styleNode.setAttribute('scoped', 'scoped');
      } else if (!this._alreadyGloballyInjected) {
        DOM.injectStyles(this.css);
        this._alreadyGloballyInjected = true;
      }
    } else if (!this._alreadyGloballyInjected) {
      DOM.injectStyles(this.css);
      this._alreadyGloballyInjected = true;
    }
  }
}

export function _createCSSResource(address: string): Function {
  @resource(new CSSResource(address))
  class ViewCSS extends CSSViewEngineHooks {}
  return ViewCSS;
}

/**
* Used to compose a new view / view-model template or bind to an existing instance.
*/
@customElement('compose')
@noView
@inject(DOM.Element, Container, CompositionEngine, ViewSlot, ViewResources, TaskQueue)
export class Compose {
  /**
  * Model to bind the custom element to.
  *
  * @property model
  * @type {CustomElement}
  */
  @bindable model
  /**
  * View to bind the custom element to.
  *
  * @property view
  * @type {HtmlElement}
  */
  @bindable view
  /**
  * View-model to bind the custom element's template to.
  *
  * @property viewModel
  * @type {Class}
  */
  @bindable viewModel

  /**
  * Creates an instance of Compose.
  * @param element The Compose element.
  * @param container The dependency injection container instance.
  * @param compositionEngine CompositionEngine instance to compose the element.
  * @param viewSlot The slot the view is injected in to.
  * @param viewResources Collection of resources used to compile the the view.
  * @param taskQueue The TaskQueue instance.
  */
  constructor(element, container, compositionEngine, viewSlot, viewResources, taskQueue) {
    this.element = element;
    this.container = container;
    this.compositionEngine = compositionEngine;
    this.viewSlot = viewSlot;
    this.viewResources = viewResources;
    this.taskQueue = taskQueue;
    this.currentController = null;
    this.currentViewModel = null;
  }

  /**
  * Invoked when the component has been created.
  *
  * @param owningView The view that this component was created inside of.
  */
  created(owningView: View) {
    this.owningView = owningView;
  }

  /**
  * Used to set the bindingContext.
  *
  * @param bindingContext The context in which the view model is executed in.
  * @param overrideContext The context in which the view model is executed in.
  */
  bind(bindingContext, overrideContext) {
    this.bindingContext = bindingContext;
    this.overrideContext = overrideContext;
    processInstruction(this, createInstruction(this, {
      view: this.view,
      viewModel: this.viewModel,
      model: this.model
    }));
  }

  /**
  * Unbinds the Compose.
  */
  unbind(bindingContext, overrideContext) {
    this.bindingContext = null;
    this.overrideContext = null;
    let returnToCache = true;
    let skipAnimation = true;
    this.viewSlot.removeAll(returnToCache, skipAnimation);
  }

  /**
  * Invoked everytime the bound model changes.
  * @param newValue The new value.
  * @param oldValue The old value.
  */
  modelChanged(newValue, oldValue) {
    if (this.currentInstruction) {
      this.currentInstruction.model = newValue;
      return;
    }

    this.taskQueue.queueMicroTask(() => {
      if (this.currentInstruction) {
        this.currentInstruction.model = newValue;
        return;
      }

      let vm = this.currentViewModel;

      if (vm && typeof vm.activate === 'function') {
        vm.activate(newValue);
      }
    });
  }

  /**
  * Invoked everytime the bound view changes.
  * @param newValue The new value.
  * @param oldValue The old value.
  */
  viewChanged(newValue, oldValue) {
    let instruction = createInstruction(this, {
      view: newValue,
      viewModel: this.currentViewModel || this.viewModel,
      model: this.model
    });

    if (this.currentInstruction) {
      this.currentInstruction = instruction;
      return;
    }

    this.currentInstruction = instruction;
    this.taskQueue.queueMicroTask(() => processInstruction(this, this.currentInstruction));
  }

  /**
    * Invoked everytime the bound view model changes.
    * @param newValue The new value.
    * @param oldValue The old value.
    */
  viewModelChanged(newValue, oldValue) {
    let instruction = createInstruction(this, {
      viewModel: newValue,
      view: this.view,
      model: this.model
    });

    if (this.currentInstruction) {
      this.currentInstruction = instruction;
      return;
    }

    this.currentInstruction = instruction;
    this.taskQueue.queueMicroTask(() => processInstruction(this, this.currentInstruction));
  }
}

function createInstruction(composer, instruction) {
  return Object.assign(instruction, {
    bindingContext: composer.bindingContext,
    overrideContext: composer.overrideContext,
    owningView: composer.owningView,
    container: composer.container,
    viewSlot: composer.viewSlot,
    viewResources: composer.viewResources,
    currentController: composer.currentController,
    host: composer.element
  });
}

function processInstruction(composer, instruction) {
  composer.currentInstruction = null;
  composer.compositionEngine.compose(instruction).then(controller => {
    composer.currentController = controller;
    composer.currentViewModel = controller ? controller.viewModel : null;
  });
}

/**
* Attribute to be placed on any element to have it emit the View Compiler's
* TargetInstruction into the debug console, giving you insight into all the
* parsed bindings, behaviors and event handers for the targeted element.
*/
@customAttribute('compile-spy')
@inject(DOM.Element, TargetInstruction)
export class CompileSpy {
  /**
  * Creates and instanse of CompileSpy.
  * @param element target element on where attribute is placed on.
  * @param instruction instructions for how the target element should be enhanced.
  */
  constructor(element, instruction) {
    LogManager.getLogger('compile-spy').info(element, instruction);
  }
}

export class BindingSignaler {
  signals = {};

  signal(name: string): void {
    let bindings = this.signals[name];
    if (!bindings) {
      return;
    }
    let i = bindings.length;
    while (i--) {
      bindings[i].call(sourceContext);
    }
  }
}

class ModeBindingBehavior {
  constructor(mode) {
    this.mode = mode;
  }

  bind(binding, source, lookupFunctions) {
    binding.originalMode = binding.mode;
    binding.mode = this.mode;
  }

  unbind(binding, source) {
    binding.mode = binding.originalMode;
    binding.originalMode = null;
  }
}

export class OneTimeBindingBehavior extends ModeBindingBehavior {
  constructor() {
    super(bindingMode.oneTime);
  }
}

export class OneWayBindingBehavior extends ModeBindingBehavior {
  constructor() {
    super(bindingMode.oneWay);
  }
}

export class TwoWayBindingBehavior extends ModeBindingBehavior {
  constructor() {
    super(bindingMode.twoWay);
  }
}

/**
* Behaviors that do not require the composition lifecycle callbacks when replacing
* their binding context.
*/
export const lifecycleOptionalBehaviors = ['focus', 'if', 'repeat', 'show', 'with'];

function behaviorRequiresLifecycle(instruction) {
  let t = instruction.type;
  let name = t.elementName !== null ? t.elementName : t.attributeName;
  if (lifecycleOptionalBehaviors.indexOf(name) === -1) {
    return t.handlesAttached || t.handlesBind || t.handlesCreated || t.handlesDetached || t.handlesUnbind;
  }
  return instruction.viewFactory && viewsRequireLifecycle(instruction.viewFactory);
}

function targetRequiresLifecycle(instruction) {
  // check each behavior instruction.
  let behaviors = instruction.behaviorInstructions;
  if (behaviors) {
    let i = behaviors.length;
    while (i--) {
      if (behaviorRequiresLifecycle(behaviors[i])) {
        return true;
      }
    }
  }

  // check the instruction's view factory (if it has one).
  return instruction.viewFactory && viewsRequireLifecycle(instruction.viewFactory);
}

export function viewsRequireLifecycle(viewFactory) {
  // already analyzed?
  if ('_viewsRequireLifecycle' in viewFactory) {
    return viewFactory._viewsRequireLifecycle;
  }

  // access inner view factory.
  if (viewFactory.viewFactory) {
    viewFactory._viewsRequireLifecycle = viewsRequireLifecycle(viewFactory.viewFactory);
    return viewFactory._viewsRequireLifecycle;
  }

  // template uses animation?
  if (viewFactory.template.querySelector('.au-animate')) {
    viewFactory._viewsRequireLifecycle = true;
    return true;
  }

  // target instructions require lifecycle?
  for (let id in viewFactory.instructions) {
    if (targetRequiresLifecycle(viewFactory.instructions[id])) {
      viewFactory._viewsRequireLifecycle = true;
      return true;
    }
  }

  // safe to skip lifecycle.
  viewFactory._viewsRequireLifecycle = false;
  return false;
}

/**
* A strategy for repeating a template over an array.
*/
export class ArrayRepeatStrategy {
  /**
  * Gets an observer for the specified collection.
  * @param observerLocator The observer locator instance.
  * @param items The items to be observed.
  */
  getCollectionObserver(observerLocator, items) {
    return observerLocator.getArrayObserver(items);
  }

  /**
  * Handle the repeat's collection instance changing.
  * @param repeat The repeater instance.
  * @param items The new array instance.
  */
  instanceChanged(repeat, items) {
    if (repeat.viewsRequireLifecycle) {
      let removePromise = repeat.viewSlot.removeAll(true);
      if (removePromise instanceof Promise) {
        removePromise.then(() => this._standardProcessInstanceChanged(repeat, items));
        return;
      }
      this._standardProcessInstanceChanged(repeat, items);
      return;
    }
    this._inPlaceProcessItems(repeat, items);
  }

  _standardProcessInstanceChanged(repeat, items) {
    for (let i = 0, ii = items.length; i < ii; i++) {
      let overrideContext = createFullOverrideContext(repeat, items[i], i, ii);
      let view = repeat.viewFactory.create();
      view.bind(overrideContext.bindingContext, overrideContext);
      repeat.viewSlot.add(view);
    }
  }

  _inPlaceProcessItems(repeat, items) {
    let itemsLength = items.length;
    let viewsLength = repeat.viewSlot.children.length;
    // remove unneeded views.
    while (viewsLength > itemsLength) {
      viewsLength--;
      repeat.viewSlot.removeAt(viewsLength, true);
    }
    // avoid repeated evaluating the property-getter for the "local" property.
    let local = repeat.local;
    // re-evaluate bindings on existing views.
    for (let i = 0; i < viewsLength; i++) {
      let view = repeat.viewSlot.children[i];
      let last = i === itemsLength - 1;
      let middle = i !== 0 && !last;
      // any changes to the binding context?
      if (view.bindingContext[local] === items[i]
        && view.overrideContext.$middle === middle
        && view.overrideContext.$last === last) {
        // no changes. continue...
        continue;
      }
      // update the binding context and refresh the bindings.
      view.bindingContext[local] = items[i];
      view.overrideContext.$middle = middle;
      view.overrideContext.$last = last;
      let j = view.bindings.length;
      while (j--) {
        updateOneTimeBinding(view.bindings[j]);
      }
      j = view.controllers.length;
      while (j--) {
        let k = view.controllers[j].boundProperties.length;
        while (k--) {
          let binding = view.controllers[j].boundProperties[k].binding;
          updateOneTimeBinding(binding);
        }
      }
    }
    // add new views
    for (let i = viewsLength; i < itemsLength; i++) {
      let overrideContext = createFullOverrideContext(repeat, items[i], i, itemsLength);
      let view = repeat.viewFactory.create();
      view.bind(overrideContext.bindingContext, overrideContext);
      repeat.viewSlot.add(view);
    }
  }

  /**
  * Handle the repeat's collection instance mutating.
  * @param repeat The repeat instance.
  * @param array The modified array.
  * @param splices Records of array changes.
  */
  instanceMutated(repeat, array, splices) {
    if (repeat.viewsRequireLifecycle) {
      this._standardProcessInstanceMutated(repeat, array, splices);
      return;
    }
    this._inPlaceProcessItems(repeat, array);
  }

  _standardProcessInstanceMutated(repeat, array, splices) {
    if (repeat.__queuedSplices) {
      for (let i = 0, ii = splices.length; i < ii; ++i) {
        let {index, removed, addedCount} = splices[i];
        mergeSplice(repeat.__queuedSplices, index, removed, addedCount);
      }
      repeat.__array = array.slice(0);
      return;
    }

    let maybePromise = this._runSplices(repeat, array.slice(0), splices);
    if (maybePromise instanceof Promise) {
      let queuedSplices = repeat.__queuedSplices = [];

      let runQueuedSplices = () => {
        if (! queuedSplices.length) {
          delete repeat.__queuedSplices;
          delete repeat.__array;
          return;
        }

        let nextPromise = this._runSplices(repeat, repeat.__array, queuedSplices) || Promise.resolve();
        queuedSplices = repeat.__queuedSplices = [];
        nextPromise.then(runQueuedSplices);
      };

      maybePromise.then(runQueuedSplices);
    }
  }

  /**
  * Run a normalised set of splices against the viewSlot children.
  * @param repeat The repeat instance.
  * @param array The modified array.
  * @param splices Records of array changes.
  * @return {Promise|undefined} A promise if animations have to be run.
  * @pre The splices must be normalised so as:
  *  * Any item added may not be later removed.
  *  * Removals are ordered by asending index
  */
  _runSplices(repeat, array, splices) {
    let removeDelta = 0;
    let viewSlot = repeat.viewSlot;
    let rmPromises = [];

    for (let i = 0, ii = splices.length; i < ii; ++i) {
      let splice = splices[i];
      let removed = splice.removed;

      for (let j = 0, jj = removed.length; j < jj; ++j) {
        // the rmPromises.length correction works due to the ordered removal precondition
        let viewOrPromise = viewSlot.removeAt(splice.index + removeDelta + rmPromises.length, true);
        if (viewOrPromise instanceof Promise) {
          rmPromises.push(viewOrPromise);
        }
      }
      removeDelta -= splice.addedCount;
    }

    if (rmPromises.length > 0) {
      return Promise.all(rmPromises).then(() => {
        let spliceIndexLow = this._handleAddedSplices(repeat, array, splices);
        updateOverrideContexts(repeat.viewSlot.children, spliceIndexLow);
      });
    }

    let spliceIndexLow = this._handleAddedSplices(repeat, array, splices);
    updateOverrideContexts(repeat.viewSlot.children, spliceIndexLow);
  }

  _handleAddedSplices(repeat, array, splices) {
    let spliceIndex;
    let spliceIndexLow;
    let arrayLength = array.length;
    for (let i = 0, ii = splices.length; i < ii; ++i) {
      let splice = splices[i];
      let addIndex = spliceIndex = splice.index;
      let end = splice.index + splice.addedCount;

      if (typeof spliceIndexLow === 'undefined' || spliceIndexLow === null || spliceIndexLow > splice.index) {
        spliceIndexLow = spliceIndex;
      }

      for (; addIndex < end; ++addIndex) {
        let overrideContext = createFullOverrideContext(repeat, array[addIndex], addIndex, arrayLength);
        let view = repeat.viewFactory.create();
        view.bind(overrideContext.bindingContext, overrideContext);
        repeat.viewSlot.insert(addIndex, view);
      }
    }

    return spliceIndexLow;
  }
}

/**
* A strategy for repeating a template over a Map.
*/
export class MapRepeatStrategy {
  /**
  * Gets a Map observer.
  * @param items The items to be observed.
  */
  getCollectionObserver(observerLocator, items) {
    return observerLocator.getMapObserver(items);
  }

  /**
  * Process the provided Map entries.
  * @param items The entries to process.
  */
  instanceChanged(repeat, items) {
    let removePromise = repeat.viewSlot.removeAll(true);
    if (removePromise instanceof Promise) {
      removePromise.then(() => this._standardProcessItems(repeat, items));
      return;
    }
    this._standardProcessItems(repeat, items);
  }

  _standardProcessItems(repeat, items) {
    let viewFactory = repeat.viewFactory;
    let viewSlot = repeat.viewSlot;
    let index = 0;
    let overrideContext;
    let view;

    items.forEach((value, key) => {
      overrideContext = createFullOverrideContext(repeat, value, index, items.size, key);
      view = viewFactory.create();
      view.bind(overrideContext.bindingContext, overrideContext);
      viewSlot.add(view);
      ++index;
    });
  }

  /**
  * Handle changes in a Map collection.
  * @param map The underlying Map collection.
  * @param records The change records.
  */
  instanceMutated(repeat, map, records) {
    let viewSlot = repeat.viewSlot;
    let key;
    let i;
    let ii;
    let view;
    let overrideContext;
    let removeIndex;
    let record;
    let rmPromises = [];
    let viewOrPromise;

    for (i = 0, ii = records.length; i < ii; ++i) {
      record = records[i];
      key = record.key;
      switch (record.type) {
      case 'update':
        removeIndex = this._getViewIndexByKey(repeat, key);
        viewOrPromise = viewSlot.removeAt(removeIndex, true);
        if (viewOrPromise instanceof Promise) {
          rmPromises.push(viewOrPromise);
        }
        overrideContext = createFullOverrideContext(repeat, map.get(key), removeIndex, map.size, key);
        view = repeat.viewFactory.create();
        view.bind(overrideContext.bindingContext, overrideContext);
        viewSlot.insert(removeIndex, view);
        break;
      case 'add':
        overrideContext = createFullOverrideContext(repeat, map.get(key), map.size - 1, map.size, key);
        view = repeat.viewFactory.create();
        view.bind(overrideContext.bindingContext, overrideContext);
        viewSlot.insert(map.size - 1, view);
        break;
      case 'delete':
        if (record.oldValue === undefined) { return; }
        removeIndex = this._getViewIndexByKey(repeat, key);
        viewOrPromise = viewSlot.removeAt(removeIndex, true);
        if (viewOrPromise instanceof Promise) {
          rmPromises.push(viewOrPromise);
        }
        break;
      case 'clear':
        viewSlot.removeAll(true);
        break;
      default:
        continue;
      }
    }

    if (rmPromises.length > 0) {
      Promise.all(rmPromises).then(() => {
        updateOverrideContexts(repeat.viewSlot.children, 0);
      });
    } else {
      updateOverrideContexts(repeat.viewSlot.children, 0);
    }
  }

  _getViewIndexByKey(repeat, key) {
    let viewSlot = repeat.viewSlot;
    let i;
    let ii;
    let child;

    for (i = 0, ii = viewSlot.children.length; i < ii; ++i) {
      child = viewSlot.children[i];
      if (child.bindingContext[repeat.key] === key) {
        return i;
      }
    }
  }
}

/**
* A strategy for repeating a template over a number.
*/
export class NumberRepeatStrategy {
  /**
  * Return the strategies collection observer. In this case none.
  */
  getCollectionObserver() {
    return null;
  }

  /**
  * Process the provided Number.
  * @param value The Number of how many time to iterate.
  */
  instanceChanged(repeat, value) {
    let removePromise = repeat.viewSlot.removeAll(true);
    if (removePromise instanceof Promise) {
      removePromise.then(() => this._standardProcessItems(repeat, value));
      return;
    }
    this._standardProcessItems(repeat, value);
  }

  _standardProcessItems(repeat, value) {
    let viewFactory = repeat.viewFactory;
    let viewSlot = repeat.viewSlot;
    let childrenLength = viewSlot.children.length;
    let i;
    let ii;
    let overrideContext;
    let view;
    let viewsToRemove;

    value = Math.floor(value);
    viewsToRemove = childrenLength - value;

    if (viewsToRemove > 0) {
      if (viewsToRemove > childrenLength) {
        viewsToRemove = childrenLength;
      }

      for (i = 0, ii = viewsToRemove; i < ii; ++i) {
        viewSlot.removeAt(childrenLength - (i + 1), true);
      }

      return;
    }

    for (i = childrenLength, ii = value; i < ii; ++i) {
      overrideContext = createFullOverrideContext(repeat, i, i, ii);
      view = viewFactory.create();
      view.bind(overrideContext.bindingContext, overrideContext);
      viewSlot.add(view);
    }

    updateOverrideContexts(repeat.viewSlot.children, 0);
  }
}

/**
* A strategy for repeating a template over a Set.
*/
export class SetRepeatStrategy {
  /**
  * Gets a Set observer.
  * @param items The items to be observed.
  */
  getCollectionObserver(observerLocator, items) {
    return observerLocator.getSetObserver(items);
  }

  /**
  * Process the provided Set entries.
  * @param items The entries to process.
  */
  instanceChanged(repeat, items) {
    let removePromise = repeat.viewSlot.removeAll(true);
    if (removePromise instanceof Promise) {
      removePromise.then(() => this._standardProcessItems(repeat, items));
      return;
    }
    this._standardProcessItems(repeat, items);
  }

  _standardProcessItems(repeat, items) {
    let viewFactory = repeat.viewFactory;
    let viewSlot = repeat.viewSlot;
    let index = 0;
    let overrideContext;
    let view;

    items.forEach(value => {
      overrideContext = createFullOverrideContext(repeat, value, index, items.size);
      view = viewFactory.create();
      view.bind(overrideContext.bindingContext, overrideContext);
      viewSlot.add(view);
      ++index;
    });
  }

  /**
  * Handle changes in a Set collection.
  * @param map The underlying Set collection.
  * @param records The change records.
  */
  instanceMutated(repeat, set, records) {
    let viewSlot = repeat.viewSlot;
    let value;
    let i;
    let ii;
    let view;
    let overrideContext;
    let removeIndex;
    let record;
    let rmPromises = [];
    let viewOrPromise;

    for (i = 0, ii = records.length; i < ii; ++i) {
      record = records[i];
      value = record.value;
      switch (record.type) {
      case 'add':
        overrideContext = createFullOverrideContext(repeat, value, set.size - 1, set.size);
        view = repeat.viewFactory.create();
        view.bind(overrideContext.bindingContext, overrideContext);
        viewSlot.insert(set.size - 1, view);
        break;
      case 'delete':
        removeIndex = this._getViewIndexByValue(repeat, value);
        viewOrPromise = viewSlot.removeAt(removeIndex, true);
        if (viewOrPromise instanceof Promise) {
          rmPromises.push(viewOrPromise);
        }
        break;
      case 'clear':
        viewSlot.removeAll(true);
        break;
      default:
        continue;
      }
    }

    if (rmPromises.length > 0) {
      Promise.all(rmPromises).then(() => {
        updateOverrideContexts(repeat.viewSlot.children, 0);
      });
    } else {
      updateOverrideContexts(repeat.viewSlot.children, 0);
    }
  }

  _getViewIndexByValue(repeat, value) {
    let viewSlot = repeat.viewSlot;
    let i;
    let ii;
    let child;

    for (i = 0, ii = viewSlot.children.length; i < ii; ++i) {
      child = viewSlot.children[i];
      if (child.bindingContext[repeat.local] === value) {
        return i;
      }
    }
  }
}

/**
* Simple html sanitization converter to preserve whitelisted elements and attributes on a bound property containing html.
*/
@valueConverter('sanitizeHTML')
@inject(HTMLSanitizer)
export class SanitizeHTMLValueConverter {
  /**
   * Creates an instanse of the value converter.
   * @param sanitizer The html sanitizer.
   */
  constructor(sanitizer) {
    this.sanitizer = sanitizer;
  }

  /**
  * Process the provided markup that flows to the view.
  * @param untrustedMarkup The untrusted markup to be sanitized.
  */
  toView(untrustedMarkup) {
    if (untrustedMarkup === null || untrustedMarkup === undefined) {
      return null;
    }

    return this.sanitizer.sanitize(untrustedMarkup);
  }
}

export class SignalBindingBehavior {
  static inject() { return [BindingSignaler]; }
  signals;

  constructor(bindingSignaler) {
    this.signals = bindingSignaler.signals;
  }

  bind(binding, source) {
    if (!binding.updateTarget) {
      throw new Error('Only property bindings and string interpolation bindings can be signaled.  Trigger, delegate and call bindings cannot be signaled.');
    }
    if (arguments.length === 3) {
      let name = arguments[2];
      let bindings = this.signals[name] || (this.signals[name] = []);
      bindings.push(binding);
      binding.signalName = name;
    } else if (arguments.length > 3) {
      let names = Array.prototype.slice.call(arguments, 2);
      let i = names.length;
      while (i--) {
        let name = names[i];
        let bindings = this.signals[name] || (this.signals[name] = []);
        bindings.push(binding);
      }
      binding.signalName = names;
    } else {
      throw new Error('Signal name is required.');
    }
  }

  unbind(binding, source) {
    let name = binding.signalName;
    binding.signalName = null;
    if (Array.isArray(name)) {
      let names = name;
      let i = names.length;
      while (i--) {
        let n = names[i];
        let bindings = this.signals[n];
        bindings.splice(bindings.indexOf(binding), 1);
      }
    } else {
      let bindings = this.signals[name];
      bindings.splice(bindings.indexOf(binding), 1);
    }
  }
}

/**
* A strategy is for repeating a template over an iterable or iterable-like object.
*/
interface RepeatStrategy {
  instanceChanged(repeat: Repeat, items: any): void;
  instanceMutated(repeat: Repeat, items: any, changes: any): void;
  getCollectionObserver(observerLocator: any, items: any): any;
}

/**
* Locates the best strategy to best repeating a template over different types of collections.
* Custom strategies can be plugged in as well.
*/
export class RepeatStrategyLocator {
  /**
  * Creates a new RepeatStrategyLocator.
  */
  constructor() {
    this.matchers = [];
    this.strategies = [];

    this.addStrategy(items => items === null || items === undefined, new NullRepeatStrategy());
    this.addStrategy(items => items instanceof Array, new ArrayRepeatStrategy());
    this.addStrategy(items => items instanceof Map, new MapRepeatStrategy());
    this.addStrategy(items => items instanceof Set, new SetRepeatStrategy());
    this.addStrategy(items => typeof items === 'number', new NumberRepeatStrategy());
  }

  /**
  * Adds a repeat strategy to be located when repeating a template over different collection types.
  * @param strategy A repeat strategy that can iterate a specific collection type.
  */
  addStrategy(matcher: (items: any) => boolean, strategy: RepeatStrategy) {
    this.matchers.push(matcher);
    this.strategies.push(strategy);
  }

  /**
  * Gets the best strategy to handle iteration.
  */
  getStrategy(items: any): RepeatStrategy {
    let matchers = this.matchers;

    for (let i = 0, ii = matchers.length; i < ii; ++i) {
      if (matchers[i](items)) {
        return this.strategies[i];
      }
    }

    return null;
  }
}

/*eslint no-loop-func:0, no-unused-vars:0*/
/**
* Binding to iterate over iterable objects (Array, Map and Number) to genereate a template for each iteration.
*/
@customAttribute('repeat')
@templateController
@inject(BoundViewFactory, TargetInstruction, ViewSlot, ViewResources, ObserverLocator, RepeatStrategyLocator)
export class Repeat {
  /**
  * List of items to bind the repeater to.
  *
  * @property items
  */
  @bindable items
  /**
  * Local variable which gets assigned on each iteration.
  *
  * @property local
  */
  @bindable local
  /**
  * Key when iterating over Maps.
  *
  * @property key
  */
  @bindable key
  /**
  * Value when iterating over Maps.
  *
  * @property value
  */
  @bindable value

  /**
 * Creates an instance of Repeat.
 * @param viewFactory The factory generating the view
 * @param instruction The instructions for how the element should be enhanced.
 * @param viewResources Collection of resources used to compile the the views.
 * @param viewSlot The slot the view is injected in to.
 * @param observerLocator The observer locator instance.
 * @param collectionStrategyLocator The strategy locator to locate best strategy to iterate the collection.
 */
  constructor(viewFactory, instruction, viewSlot, viewResources, observerLocator, strategyLocator) {
    this.viewFactory = viewFactory;
    this.instruction = instruction;
    this.viewSlot = viewSlot;
    this.lookupFunctions = viewResources.lookupFunctions;
    this.observerLocator = observerLocator;
    this.local = 'item';
    this.key = 'key';
    this.value = 'value';
    this.strategyLocator = strategyLocator;
    this.ignoreMutation = false;
    this.sourceExpression = getItemsSourceExpression(this.instruction, 'repeat.for');
    this.isOneTime = isOneTime(this.sourceExpression);
    this.viewsRequireLifecycle = viewsRequireLifecycle(viewFactory);
  }

  call(context, changes) {
    this[context](this.items, changes);
  }

  /**
  * Binds the repeat to the binding context and override context.
  * @param bindingContext The binding context.
  * @param overrideContext An override context for binding.
  */
  bind(bindingContext, overrideContext) {
    this.scope = { bindingContext, overrideContext };
    this.itemsChanged();
  }

  /**
  * Unbinds the repeat
  */
  unbind() {
    this.scope = null;
    this.items = null;
    this.viewSlot.removeAll(true);
    this._unsubscribeCollection();
  }

  _unsubscribeCollection() {
    if (this.collectionObserver) {
      this.collectionObserver.unsubscribe(this.callContext, this);
      this.collectionObserver = null;
      this.callContext = null;
    }
  }

  /**
  * Invoked everytime the item property changes.
  */
  itemsChanged() {
    this._unsubscribeCollection();

    // still bound?
    if (!this.scope) {
      return;
    }

    let items = this.items;
    this.strategy = this.strategyLocator.getStrategy(items);

    if (!this.isOneTime && !this._observeInnerCollection()) {
      this._observeCollection();
    }
    this.strategy.instanceChanged(this, items);
  }

  _getInnerCollection() {
    let expression = unwrapExpression(this.sourceExpression);
    if (!expression) {
      return null;
    }
    return expression.evaluate(this.scope, null);
  }

  /**
  * Invoked when the underlying collection changes.
  */
  handleCollectionMutated(collection, changes) {
    this.strategy.instanceMutated(this, collection, changes);
  }

  /**
  * Invoked when the underlying inner collection changes.
  */
  handleInnerCollectionMutated(collection, changes) {
    // guard against source expressions that have observable side-effects that could
    // cause an infinite loop- eg a value converter that mutates the source array.
    if (this.ignoreMutation) {
      return;
    }
    this.ignoreMutation = true;
    let newItems = this.sourceExpression.evaluate(this.scope, this.lookupFunctions);
    this.observerLocator.taskQueue.queueMicroTask(() => this.ignoreMutation = false);

    // call itemsChanged...
    if (newItems === this.items) {
      // call itemsChanged directly.
      this.itemsChanged();
    } else {
      // call itemsChanged indirectly by assigning the new collection value to
      // the items property, which will trigger the self-subscriber to call itemsChanged.
      this.items = newItems;
    }
  }

  _observeInnerCollection() {
    let items = this._getInnerCollection();
    let strategy = this.strategyLocator.getStrategy(items);
    if (!strategy) {
      return false;
    }
    this.collectionObserver = strategy.getCollectionObserver(this.observerLocator, items);
    if (!this.collectionObserver) {
      return false;
    }
    this.callContext = 'handleInnerCollectionMutated';
    this.collectionObserver.subscribe(this.callContext, this);
    return true;
  }

  _observeCollection() {
    let items = this.items;
    this.collectionObserver = this.strategy.getCollectionObserver(this.observerLocator, items);
    if (this.collectionObserver) {
      this.callContext = 'handleCollectionMutated';
      this.collectionObserver.subscribe(this.callContext, this);
    }
  }
}

function configure(config) {
  if (FEATURE.shadowDOM) {
    DOM.injectStyles('body /deep/ .aurelia-hide { display:none !important; }');
  } else {
    DOM.injectStyles('.aurelia-hide { display:none !important; }');
  }

  config.globalResources(
    './compose',
    './if',
    './with',
    './repeat',
    './show',
    './hide',
    './replaceable',
    './sanitize-html',
    './focus',
    './compile-spy',
    './view-spy',
    './binding-mode-behaviors',
    './throttle-binding-behavior',
    './debounce-binding-behavior',
    './signal-binding-behavior',
    './update-trigger-binding-behavior'
  );

  let viewEngine = config.container.get(ViewEngine);
  let loader = config.aurelia.loader;

  viewEngine.addResourcePlugin('.html', {
    'fetch': function(address) {
      return loader.loadTemplate(address).then(registryEntry => {
        let bindable = registryEntry.template.getAttribute('bindable');
        let elementName = address.replace('.html', '');
        let index = elementName.lastIndexOf('/');

        if (index !== 0) {
          elementName = elementName.substring(index + 1);
        }

        if (bindable) {
          bindable = bindable.split(',').map(x => x.trim());
          registryEntry.template.removeAttribute('bindable');
        } else {
          bindable = [];
        }

        return { [elementName]: _createDynamicElement(elementName, address, bindable) };
      });
    }
  });

  viewEngine.addResourcePlugin('.css', {
    'fetch': function(address) {
      return { [address]: _createCSSResource(address) };
    }
  });
}

export {
  Compose,
  If,
  With,
  Repeat,
  Show,
  Hide,
  HTMLSanitizer,
  SanitizeHTMLValueConverter,
  Replaceable,
  Focus,
  CompileSpy,
  ViewSpy,
  configure,
  OneTimeBindingBehavior,
  OneWayBindingBehavior,
  TwoWayBindingBehavior,
  ThrottleBindingBehavior,
  DebounceBindingBehavior,
  SignalBindingBehavior,
  BindingSignaler,
  UpdateTriggerBindingBehavior
};

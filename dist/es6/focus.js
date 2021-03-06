import {customAttribute} from 'aurelia-templating';
import {bindingMode} from 'aurelia-binding';
import {inject} from 'aurelia-dependency-injection';
import {TaskQueue} from 'aurelia-task-queue';
import {DOM} from 'aurelia-pal';

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

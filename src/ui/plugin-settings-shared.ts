export function createCheckbox(options: {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => Promise<void> | void;
}): HTMLInputElement {
  const checkbox = document.createElement("input");
  checkbox.className = "b3-switch fn__flex-center";
  checkbox.type = "checkbox";
  checkbox.checked = options.checked;
  checkbox.disabled = Boolean(options.disabled);
  if (options.title) {
    checkbox.title = options.title;
    checkbox.setAttribute("aria-label", options.title);
  }
  checkbox.addEventListener("change", () => {
    void options.onChange(checkbox.checked);
  });
  return checkbox;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (typeof textContent === "string") {
    element.textContent = textContent;
  }
  return element;
}

export function createTextInput(options: {
  type?: "text" | "password" | "number";
  value: string;
  placeholder?: string;
  inputMode?: string;
  dataSettingKey: string;
  onChange: (value: string) => Promise<void> | void;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "b3-text-field";
  input.type = options.type || "text";
  input.value = options.value;
  input.dataset.settingKey = options.dataSettingKey;
  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }
  if (options.inputMode) {
    input.inputMode = options.inputMode as any;
  }
  input.addEventListener("change", () => {
    void options.onChange(input.value);
  });
  return input;
}

export function createTextareaInput(options: {
  value: string;
  placeholder?: string;
  rows?: number;
  dataSettingKey: string;
  onChange: (value: string) => Promise<void> | void;
}): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "b3-text-field doc-assistant-settings__textarea";
  textarea.value = options.value;
  textarea.dataset.settingKey = options.dataSettingKey;
  textarea.rows = options.rows || 8;
  if (options.placeholder) {
    textarea.placeholder = options.placeholder;
  }
  textarea.addEventListener("change", () => {
    void options.onChange(textarea.value);
  });
  return textarea;
}

export function createFieldRow(options: {
  label: string;
  hint?: string;
  input: HTMLElement;
}): HTMLLabelElement {
  const field = createElement("label", "doc-assistant-settings__ai-field");
  const textWrap = createElement("div", "doc-assistant-settings__ai-field-text");
  textWrap.append(
    createElement("div", "doc-assistant-settings__ai-field-label", options.label)
  );
  if (options.hint) {
    textWrap.append(
      createElement("div", "doc-assistant-settings__ai-field-hint", options.hint)
    );
  }
  field.append(textWrap, options.input);
  return field;
}

export function createCollapseButton(options: {
  key: string;
  label: string;
  content: HTMLElement;
  expanded?: boolean;
}): HTMLButtonElement {
  const button = document.createElement("button");
  const text = createElement("span", "doc-assistant-settings__collapse-button-label");
  const icon = createElement("span", "doc-assistant-settings__collapse-button-icon");
  let expanded = options.expanded ?? true;

  button.type = "button";
  button.className = "doc-assistant-settings__collapse-button";
  button.dataset.settingCollapse = options.key;
  button.append(text, icon);

  const sync = () => {
    options.content.hidden = !expanded;
    button.classList.toggle("is-collapsed", !expanded);
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", `${expanded ? "折叠" : "展开"}${options.label}`);
    button.title = `${expanded ? "折叠" : "展开"}${options.label}`;
    text.textContent = expanded ? "收起" : "展开";
    icon.textContent = expanded ? "▾" : "▸";
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    expanded = !expanded;
    sync();
  });

  sync();
  return button;
}

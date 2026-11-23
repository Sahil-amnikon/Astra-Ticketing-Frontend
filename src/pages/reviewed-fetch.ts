'use client';
type Review = {
  title: string;
  recordNumber: string;
  recordType: string;
  reasons: string[];
  proposed: string;
  disclaimer: string;
  token: string;
};
let showing = false;
async function confirmReview(review: Review): Promise<string | null> {
  if (showing)
    throw new Error(
      'Finish reviewing the current update before submitting another.',
    );
  showing = true;
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'update-review-dialog';
    dialog.setAttribute('aria-labelledby', 'update-review-title');
    dialog.setAttribute('aria-describedby', 'update-review-disclaimer');
    const form = document.createElement('form');
    form.method = 'dialog';
    const add = (tag: string, text: string, cls?: string) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      form.append(el);
      return el;
    };
    add('p', 'CHECK BEFORE SAVING', 'update-review-kicker');
    const title = add('h2', 'Possible update mismatch');
    title.id = 'update-review-title';
    add(
      'p',
      `${review.recordNumber} · ${review.title}`,
      'update-review-record',
    );
    const list = document.createElement('ul');
    for (const reason of review.reasons) {
      const li = document.createElement('li');
      li.textContent = reason;
      list.append(li);
    }
    form.append(list);
    add('h3', 'Your proposed update');
    add('pre', review.proposed, 'update-review-preview');
    const disclaimer = add('p', review.disclaimer, 'update-review-disclaimer');
    disclaimer.id = 'update-review-disclaimer';
    const reasonLabel = document.createElement('label');
    reasonLabel.textContent = 'Why does this update belong on this record?';
    const reason = document.createElement('textarea');
    reason.required = true;
    reason.minLength = 10;
    reason.maxLength = 1000;
    reason.rows = 3;
    reasonLabel.append(reason);
    form.append(reasonLabel);
    const acknowledgement = document.createElement('label');
    acknowledgement.className = 'update-review-ack';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.required = true;
    acknowledgement.append(
      checkbox,
      document.createTextNode(
        'I have checked the person, organization and requested work, and confirm this update belongs here.',
      ),
    );
    form.append(acknowledgement);
    const actions = document.createElement('div');
    actions.className = 'update-review-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Go back and edit';
    const proceed = document.createElement('button');
    proceed.type = 'submit';
    proceed.className = 'primary';
    proceed.textContent = 'Confirm and save';
    proceed.disabled = true;
    const validate = () => {
      proceed.disabled = !checkbox.checked || reason.value.trim().length < 10;
    };
    reason.addEventListener('input', validate);
    checkbox.addEventListener('change', validate);
    let result: string | null = null;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      result = reason.value.trim();
      dialog.close();
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
        showing = false;
        if (previous instanceof HTMLElement) previous.focus();
        resolve(result);
      },
      { once: true },
    );
    actions.append(cancel, proceed);
    form.append(actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
export async function reviewedFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  if (response.status !== 409 || typeof init.body !== 'string') return response;
  const failure = await response
    .clone()
    .json()
    .catch(() => null);
  if (
    failure?.error?.code !== 'UPDATE_REVIEW_REQUIRED' ||
    !failure.error.review
  )
    return response;
  const review = failure.error.review as Review;
  const reason = await confirmReview(review);
  if (reason === null)
    throw new Error(
      'Update was not saved. Review or edit your draft before trying again.',
    );
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
    body: JSON.stringify({
      ...JSON.parse(init.body),
      relevanceToken: review.token,
      relevanceReason: reason,
    }),
  });
}

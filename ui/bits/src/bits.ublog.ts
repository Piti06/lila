import * as xhr from 'lib/xhr';
import { throttlePromiseDelay } from 'lib/async';
import { info } from 'lib/view/dialogs';

site.load.then(() => {
  $('.flash').addClass('fade');
  $('.ublog-post__like').on(
    'click',
    throttlePromiseDelay(
      () => 1000,
      async function (this: HTMLButtonElement) {
        const button = $(this),
          likeClass = 'ublog-post__like--liked',
          liked = !button.hasClass(likeClass);
        return await xhr
          .text(`/ublog/${button.data('rel')}/like?v=${liked}`, {
            method: 'post',
          })
          .then(likes => {
            const label = $('.ublog-post__like .button-label');
            const newText = label.data(`i18n-${liked ? 'unlike' : 'like'}`);
            label.text(newText);
            $('.ublog-post__like').toggleClass(likeClass, liked).attr('title', newText);
            $('.ublog-post__like__nb').text(likes);
          });
      },
    ),
  );
  $('.ublog-post__follow button').on(
    'click',
    throttlePromiseDelay(
      () => 1000,
      async function (this: HTMLButtonElement) {
        const button = $(this),
          followClass = 'followed';
        return await xhr
          .text(button.data('rel'), {
            method: 'post',
          })
          .then(() => button.parent().toggleClass(followClass));
      },
    ),
  );
  $('#form3-tier').on('change', function (this: HTMLSelectElement) {
    (this.parentNode as HTMLFormElement).submit();
  });
  document
    .querySelectorAll<HTMLElement>('.automod *[title]')
    .forEach(el => el.addEventListener('click', () => info(el.title)));
});

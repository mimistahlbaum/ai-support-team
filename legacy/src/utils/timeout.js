function withTimeout(promiseFactory, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);

    Promise.resolve()
      .then(() => promiseFactory())
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export { withTimeout };

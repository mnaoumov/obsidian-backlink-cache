export async function retryWithTimeout(
  asyncFn: () => Promise<boolean>,
  {
    timeoutInMilliseconds = 5000,
    retryDelayInMilliseconds = 100,
  }: {
    timeoutInMilliseconds?: number,
    retryDelayInMilliseconds?: number,
  } = {}
): Promise<void> {
  await runWithTimeout(timeoutInMilliseconds, async () => {
    let failedBefore = false;
    while (true) {
      if (await asyncFn()) {
        if (failedBefore) {
          console.debug("Retry completed successfully");
        }
        return;
      }

      failedBefore = true;
      console.debug(`Retry completed unsuccessfully. Trying again in ${retryDelayInMilliseconds} milliseconds`);
      await delay(retryDelayInMilliseconds);
    }
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runWithTimeout<R>(timeoutInMilliseconds: number, asyncFn: () => Promise<R>): Promise<R> {
  return await Promise.race([asyncFn(), timeout()]);

  async function timeout(): Promise<never> {
    await delay(timeoutInMilliseconds);
    throw new Error(`Timed out in ${timeoutInMilliseconds} milliseconds`);
  }
}

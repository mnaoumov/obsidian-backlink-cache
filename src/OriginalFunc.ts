type OriginalFuncWrapper<T> = { originalFunc?: T };

export function getOriginalFunc<T>(func: T): T | undefined {
  return (func as OriginalFuncWrapper<T>).originalFunc;
}

export function setOriginalFunc<T>(func: T, originalFunc: T): void {
  (func as OriginalFuncWrapper<T>).originalFunc = originalFunc;
}

type OriginalFuncWrapper<T> = { originalFunc?: T };

export function setOriginalFunc<T>(func: T, originalFunc: T): void {
  (func as OriginalFuncWrapper<T>).originalFunc = originalFunc;
}

type OriginalFuncWrapper<T> = T & { originalFunc?: T };

export function setOriginalFunc<T>(func: OriginalFuncWrapper<T>, originalFunc: T): void {
  func.originalFunc = originalFunc;
}

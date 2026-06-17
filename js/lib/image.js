// 画像ファイルを長辺 maxEdge に縮小し JPEG dataURL を返す
export function compressImage(file, maxEdge = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像の解析に失敗しました'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxEdge) { height = height * maxEdge / width; width = maxEdge; }
        else if (height > maxEdge) { width = width * maxEdge / height; height = maxEdge; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

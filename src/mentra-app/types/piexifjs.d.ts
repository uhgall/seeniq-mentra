declare module 'piexifjs' {
  const piexif: {
    GPSIFD: Record<string, number>;
    load(data: string): any;
    dump(data: any): string;
    insert(exifBytes: string, data: string): string;
    remove(data: string): string;
  };

  export default piexif;
}


declare module "remotestorage-widget" {
  import RemoteStorage from "remotestoragejs";

  class Widget {
    constructor(remoteStorage: RemoteStorage);
    attach(containerId: string): void;
    leaveOpen?: boolean;
  }

  export default Widget;
}

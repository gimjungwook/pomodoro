const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Now Playing
    getNowPlaying: () => ipcRenderer.invoke('get-now-playing'),
    mediaControl: (action) => ipcRenderer.invoke('media-control', action),
    isMusicAvailable: () => ipcRenderer.invoke('is-music-available'),

    // Platform info
    platform: process.platform,
    isElectron: true
});

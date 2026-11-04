package com.kitchenhome;

import android.service.notification.NotificationListenerService;

/**
 * Empty notification listener. Android only lets apps read other apps' media sessions
 * (for the "now playing" card) when they hold an enabled notification listener.
 */
public class MediaListener extends NotificationListenerService {
}

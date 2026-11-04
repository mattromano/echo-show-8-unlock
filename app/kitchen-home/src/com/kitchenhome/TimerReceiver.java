package com.kitchenhome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fired by AlarmManager when a kitchen timer ends: brings Kitchen Home to the front to ring. */
public class TimerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        Intent i = new Intent(ctx, MainActivity.class)
                .putExtra("timerDone", in.getIntExtra("id", 0))
                .putExtra("timerLabel", in.getStringExtra("label"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        ctx.startActivity(i);
    }
}

import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import android.view.KeyEvent;
import java.io.*;
import java.lang.reflect.*;
public class LatencyInput {
  static Object manager;
  static Method inject;
  static void mark(String name, long time) {
    System.out.println("{\"name\":\""+name+"\",\"native_ms\":"+time+",\"wall_ms\":"+System.currentTimeMillis()+"}");
    System.out.flush();
  }
  static void touch(int action, long down, long time, float x, float y) throws Exception {
    MotionEvent e=MotionEvent.obtain(down,time,action,x,y,0);e.setSource(InputDevice.SOURCE_TOUCHSCREEN);inject.invoke(manager,e,0);e.recycle();
  }
  public static void main(String[] args) throws Exception {
    Class<?> c=Class.forName("android.hardware.input.InputManagerGlobal");
    manager=c.getMethod("getInstance").invoke(null);
    inject=c.getMethod("injectInputEvent",InputEvent.class,int.class);
    BufferedReader r=new BufferedReader(new InputStreamReader(System.in));String line;
    mark("driver-ready",SystemClock.uptimeMillis());
    while((line=r.readLine())!=null){String[] a=line.split(" ");
      if(a[0].equals("tap")) {
        float x=Float.parseFloat(a[1]),y=Float.parseFloat(a[2]);long t=SystemClock.uptimeMillis();mark("input-down",t);touch(MotionEvent.ACTION_DOWN,t,t,x,y);
        SystemClock.sleep(Long.parseLong(a[3]));long up=SystemClock.uptimeMillis();mark("input-up",up);touch(MotionEvent.ACTION_UP,t,up,x,y);
      } else if(a[0].equals("back")) {
        long t=SystemClock.uptimeMillis();mark("input-back",t);
        inject.invoke(manager,new KeyEvent(t,t,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK,0),0);
        inject.invoke(manager,new KeyEvent(t,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK,0),0);
      }
    }
  }
}

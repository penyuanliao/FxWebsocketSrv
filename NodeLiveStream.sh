#!/bin/bash

   echo '    ______    '
   echo '   / ____/ __ '
   echo '  / /__\ \/ / '
   echo ' / ___//   /  '  
   echo '/_/   /_/\_\  '  
   echo '              '

configfile="./configfile/config.cfg";

if [ -f "$configfile" ]
then
   source "$configfile"
else
   echo '### No such file or directory... ###'
   exit 0
fi

SERV_PATH=""
for i in ${RTMP_STREAM_LIST[*]};
do
   if [ "$SERV_PATH" == "" ]
   then
      SERV_PATH="$RTMP_PATH:$RTMP_PORT${i}"
   else
      SERV_PATH="$SERV_PATH $RTMP_PATH:$RTMP_PORT${i}"
   fi

done

#SERV_PATH=\"$SERV_PATH\"

#SERV_PARAMS="--max-old-space-size=8192 --expose-gc --always-compact"
#
#SERV_FILE="../FxLiveStreamSrv.js"
#
#SERV_MULTI_FILE="../FxLiveMaster.js"
#
#SERV_PORT="3000"

#SERV_PATH="rtmp://183.182.79.162:1935/video/daabb/video0/ rtmp://183.182.79.162:1935/video/daabc/video0/"
#echo "args:" + node ${SERV_PARAMS} ${SERV_MULTI_FILE} -p ${SERV_PORT} -f "$SERV_PATH"

# exec node ${SERV_PARAMS} ${SERV_MULTI_FILE} -p ${SERV_PORT} -f "rtmp://192.168.188.72/video/daabb/video0/ rtmp://192.168.188.72/video/daabc/video0/ rtmp://192.168.188.72/video/daabd/video0/ rtmp://192.168.188.72/video/daabg/video0/ rtmp://192.168.188.72/video/daabh/video0/ rtmp://192.168.188.72/video/daabdg/video0/ rtmp://192.168.188.72/video/daabdh/video0/" > app.log 2>&1 &
# exec node ${SERV_PARAMS} ${SERV_FILE} -p ${SERV_PORT} -f "rtmp://192.168.188.72/video/daabb/video0/ rtmp://192.168.188.72/video/daabc/video0 rtmp://192.168.188.72/video/daabd/video0/ rtmp://192.168.188.72/video/daabg/video0/ rtmp://192.168.188.72/video/daabh/video0/ rtmp://192.168.188.72/video/daabdg/video0/ rtmp://192.168.188.72/video/daabdh/video0/ rtmp://192.168.188.72/video/daabb/videosd/ rtmp://192.168.188.72/video/daabc/videosd/ rtmp://192.168.188.72/video/daabd/videosd/ rtmp://192.168.188.72/video/daabg/videosd/ rtmp://192.168.188.72/video/daabh/videosd/ rtmp://192.168.188.72/video/daabdg/videosd/ rtmp://192.168.188.72/video/daabdh/videosd/ rtmp://192.168.188.72/video/daabb/videohd/ rtmp://192.168.188.72/video/daabc/videohd/ rtmp://192.168.188.72/video/daabd/videohd/ rtmp://192.168.188.72/video/daabg/videohd/ rtmp://192.168.188.72/video/daabh/videohd/ rtmp://192.168.188.72/video/daabdg/videohd/ rtmp://192.168.188.72/video/daabdh/videohd/" > app.log 2>&1 &
exec node ${SERV_PARAMS} ${SERV_MULTI_FILE} -p ${SERV_PORT} -v "$RTMP_PATH" -f "$SERV_PATH" > /dev/null 2>&1 &
echo "NodeJS Server START."

echo "$SERV_PATH"





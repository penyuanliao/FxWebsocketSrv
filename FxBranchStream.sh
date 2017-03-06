#!/bin/bash


echo " _______  ____  ___  __                          __        ______      "
echo "/\  ____\/\__ \/ __\/\ \  __                    /\ \      /\  ___\     "
echo "\ \ \___/\/_/\  / _/\ \ \/\_\  __    __  __     \ \ \___  \ \ \__/     "
echo " \ \  __\   \/  \/   \ \ \/\ \/\ \  / //'__'\    \ \  __'\ \ \____'\   "
echo "  \ \ \_/ __/ /\ \___ \ \ \ \ \ \ \/ //\  __/  __ \ \ \/\ \ \/ ___\ \  "
echo "   \ \_\ /___/  \____\ \ \_\ \_\ \__/ \ \____\/\_\ \ \_\ \_\ /\______\ "
echo "    \/_/ /____/\/____/  \/_/\/_/\/_/   \/____/\/_/  \/_/\/_/ \/______/ "
echo " 2016.012.20@Benson.liao"

configfile="./configfile/config.cfg";

NOW=$(date +"%Y%m%d");

NODE_PATH="node"

export NODE_ENV='';
export DEBUG_FD=3;
export DEBUG="";

if [ -f "$configfile" ]
then
   source "$configfile"
else
   echo '### No such file or directory... ###'
   exit 0
fi
declare -i StreamCount=0;
SERV_PATH=""
for i in ${RTMP_STREAM_LIST[*]};
do
   if [ "$SERV_PATH" == "" ]
   then
      SERV_PATH="$RTMP_PATH:$RTMP_PORT${i}"
   else
      SERV_PATH="$SERV_PATH $RTMP_PATH:$RTMP_PORT${i}"
   fi

   StreamCount=$((StreamCount + 1))
done

#read -p "Create Master FFMPEG Streaming media Server? (y or n ):" userArg1;

#service=${userArg1:-"service"}
service="y";

echo " + + NodeJS Server START. + + "

if [ "$service" == "y" ]
    then
        echo "+ + -broadcast Server + +"
        ${NODE_PATH} ${SERV_PARAMS} ${SERV_BRANCH_FILE} -p ${SERV_PORT} -f "$SERV_PATH" -broadcast > "/dev/null" 2>&1 &
    else
        echo "+ + -middleware Server + +"
        ${NODE_PATH} ${SERV_PARAMS} ${SERV_BRANCH_FILE} -p ${SERV_PORT} -f "$SERV_PATH" -middleware "$BRANCH_SOURCE_URL" > "./${NOW}_middleware.log" 2>&1 &
fi

echo " + Live Streaming connection connection: ${StreamCount}";
sleep 2
ps aux | grep node



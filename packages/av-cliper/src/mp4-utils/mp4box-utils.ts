import mp4box, {
  AudioTrackOpts,
  ESDSBoxParser,
  MP4ABoxParser,
  MP4ArrayBuffer,
  MP4File,
  MP4Info,
  MP4Sample,
  TrakBoxParser,
  VideoTrackOpts,
} from '@webav/mp4box.js';
import { DEFAULT_AUDIO_CONF } from '../clips';
import { file } from 'opfs-tools';

export function extractFileConfig(file: MP4File, info: MP4Info) {
  const vTrack = info.videoTracks[0];
  const rs: {
    videoTrackConf?: VideoTrackOpts;
    videoDecoderConf?: Parameters<VideoDecoder['configure']>[0];
    audioTrackConf?: AudioTrackOpts;
    audioDecoderConf?: Parameters<AudioDecoder['configure']>[0];
  } = {};
  if (vTrack != null) {
    const videoDesc = parseVideoCodecDesc(file.getTrackById(vTrack.id)).buffer;
    const { descKey, type } = vTrack.codec.startsWith('avc1')
      ? { descKey: 'avcDecoderConfigRecord', type: 'avc1' }
      : vTrack.codec.startsWith('hvc1')
        ? { descKey: 'hevcDecoderConfigRecord', type: 'hvc1' }
        : { descKey: '', type: '' };
    if (descKey !== '') {
      rs.videoTrackConf = {
        timescale: vTrack.timescale,
        duration: vTrack.duration,
        width: vTrack.video.width,
        height: vTrack.video.height,
        brands: info.brands,
        type,
        [descKey]: videoDesc,
      };
    }

    rs.videoDecoderConf = {
      codec: vTrack.codec,
      codedHeight: vTrack.video.height,
      codedWidth: vTrack.video.width,
      description: videoDesc,
    };
  }

  const aTrack = info.audioTracks[0];
  if (aTrack != null) {
    const esdsBox = getESDSBoxFromMP4File(file);
    rs.audioTrackConf = {
      timescale: aTrack.timescale,
      samplerate: aTrack.audio.sample_rate,
      channel_count: aTrack.audio.channel_count,
      hdlr: 'soun',
      type: aTrack.codec.startsWith('mp4a') ? 'mp4a' : aTrack.codec,
      description: getESDSBoxFromMP4File(file),
    };
    rs.audioDecoderConf = {
      codec: aTrack.codec.startsWith('mp4a')
        ? DEFAULT_AUDIO_CONF.codec
        : aTrack.codec,
      numberOfChannels: aTrack.audio.channel_count,
      sampleRate: aTrack.audio.sample_rate,
      ...(esdsBox == null ? {} : parseAudioInfo4ESDSBox(esdsBox)),
    };
  }
  return rs;
}

// track is H.264, H.265 or VPX.
function parseVideoCodecDesc(track: TrakBoxParser): Uint8Array {
  for (const entry of track.mdia.minf.stbl.stsd.entries) {
    // @ts-expect-error
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC;
    if (box != null) {
      const stream = new mp4box.DataStream(
        undefined,
        0,
        mp4box.DataStream.BIG_ENDIAN,
      );
      box.write(stream);
      return new Uint8Array(stream.buffer.slice(8)); // Remove the box header.
    }
  }
  throw Error('avcC, hvcC or VPX not found');
}

function getESDSBoxFromMP4File(file: MP4File, codec = 'mp4a') {
  const mp4aBox = file.moov?.traks
    .map((t) => t.mdia.minf.stbl.stsd.entries)
    .flat()
    .find(({ type }) => type === codec) as MP4ABoxParser;

  return mp4aBox?.esds;
}

// 解决封装层音频信息标识错误，导致解码异常
function parseAudioInfo4ESDSBox(esds: ESDSBoxParser) {
  const decoderConf = esds.esd.descs[0]?.descs[0];
  if (decoderConf == null) return {};

  const [byte1, byte2] = decoderConf.data;
  // sampleRate 是第一字节后 3bit + 第二字节前 1bit
  const sampleRateIdx = ((byte1 & 0x07) << 1) + (byte2 >> 7);
  // numberOfChannels 是第二字节 [2, 5] 4bit
  const numberOfChannels = (byte2 & 0x7f) >> 3;
  const sampleRateEnum = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
    8000, 7350,
  ] as const;
  return {
    sampleRate: sampleRateEnum[sampleRateIdx],
    numberOfChannels,
  };
}

/**
 * 强行回收 mp4boxfile 尽量降低内存占用，会破坏 file 导致无法正常使用
 * 仅用于获取二进制后，不再需要任何 file 功能的场景
 */
export function unsafeReleaseMP4BoxFile(file: MP4File) {
  if (file.moov == null) return;
  for (var j = 0; j < file.moov.traks.length; j++) {
    file.moov.traks[j].samples = [];
  }
  file.mdats = [];
  file.moofs = [];
}

type IBox = {
  type: string;
  offset: number;
  size: number;
};

function isAlphabetOnly(str: string) {
  const regex = /^[A-Za-z]+$/;
  return regex.test(str);
}

// /**
//  * 读取mp4 uint8 数据流的所有最外层的box
//  * @param dataArr
//  * @param maxParseNum 最多解析次数，防止非mp4文件造成过多次读取
//  * @param offset 初始的读取offset
//  * @param checkNum 是否检查解析出的box数量
//  * @returns IBox[]
//  */
// export function getAllBoxes(
//   dataArr: Uint8Array,
//   maxParseNum: number = 2000,
//   offset: number = 0,
//   checkNum: boolean = true,
// ): IBox[] {
//   const HEADER_META_SIZE = 8; // byte box size + box type
//   const HEADER_LARGER_SIZE = 8;
//   const commonTypes = ['moov', 'ftyp', 'uuid', 'mdat', 'free', 'moof', 'mfra'];
//   let currentOffset = offset;
//   let currentParseTimes = 0;
//   const boxes: IBox[] = [];
//   while (currentOffset < dataArr.length && currentParseTimes++ < maxParseNum) {
//     let uint8a = dataArr.slice(currentOffset, currentOffset + HEADER_META_SIZE);
//     // 读取前四位
//     let boxSizeBinary = [0, 1, 2, 3].reduce((prev, cur) => {
//       return prev + uint8a[cur].toString(2).padStart(8, '0');
//     }, '');
//     let boxSize = parseInt(boxSizeBinary, 2);
//     // 读取后四位
//     let boxType = [4, 5, 6, 7].reduce((prev, cur) => {
//       return prev + String.fromCharCode(uint8a[cur]);
//     }, '');
//     if (!commonTypes.includes(boxType)) {
//       console.warn(`未知box类型: ${boxType}`);
//     }
//     if (!isAlphabetOnly(boxType)) {
//       // 非法字符直接报错
//       throw new Error('not mp4 box');
//     }
//     if (boxSize === 1) {
//       uint8a = dataArr.slice(
//         currentOffset + HEADER_META_SIZE,
//         currentOffset + HEADER_META_SIZE + HEADER_LARGER_SIZE,
//       );
//       let boxSizeBinary = [0, 1, 2, 3, 4, 5, 6, 7].reduce((prev, cur) => {
//         return prev + uint8a[cur].toString(2).padStart(8, '0');
//       }, '');
//       boxSize = parseInt(boxSizeBinary, 2);
//     }
//     boxes.push({
//       type: boxType,
//       offset: currentOffset,
//       size: boxSize,
//     });
//     currentOffset += boxSize;
//   }
//   if (boxes.length >= maxParseNum && checkNum) {
//     throw new Error('too many boxes');
//   }
//   // let ftypFlag = false;
//   // boxes.find((box) => {
//   //   if (box.type === 'ftyp') {
//   //     ftypFlag = true;
//   //     return true;
//   //   } else {
//   //     return false;
//   //   }
//   // });
//   // if (!ftypFlag) {
//   //   throw new Error('boxes incomplete, no ftyp');
//   // }
//   return boxes;
// }

/**
 * 快速解析 mp4 文件，如果是非 fMP4 格式，会优先解析 moov box（略过 mdat）避免占用过多内存
 */
export async function quickParseMP4File(
  reader: Awaited<ReturnType<ReturnType<typeof file>['createReader']>>,
  onReady: (data: { mp4boxFile: MP4File; info: MP4Info }) => void,
  onSamples: (
    id: number,
    sampleType: 'video' | 'audio',
    samples: MP4Sample[],
  ) => void,
) {
  const fileSize = await reader.getSize();

  const mp4boxFile = mp4box.createFile(false);
  mp4boxFile.onReady = (info) => {
    onReady({ mp4boxFile, info });
    const vTrackId = info.videoTracks[0]?.id;
    if (vTrackId != null)
      mp4boxFile.setExtractionOptions(vTrackId, 'video', { nbSamples: 100 });

    const aTrackId = info.audioTracks[0]?.id;
    if (aTrackId != null)
      mp4boxFile.setExtractionOptions(aTrackId, 'audio', { nbSamples: 100 });

    mp4boxFile.start();
  };
  mp4boxFile.onSamples = onSamples;

  await parse();

  async function parse() {
    let cursor = 0;
    let isFMP4 = false;
    const mdatBoxes = [];
    while (true) {
      if (isFMP4) {
        const data = (await reader.read(30 * 1024 * 1024, {
          at: cursor,
        })) as MP4ArrayBuffer;
        if (data.byteLength === 0) break;

        data.fileStart = cursor;
        mp4boxFile.appendBuffer(data);
        cursor += data.byteLength;
      } else {
        const box = await getNextBox(cursor);
        if (box == null) break;

        if (box.name === 'moof') isFMP4 = true;
        if (box.name === 'mdat' && box.data == null) {
          mdatBoxes.push(box);
        }
        if (box.data != null) {
          const boxData = box.data as MP4ArrayBuffer;
          boxData.fileStart = box.offset;
          mp4boxFile.appendBuffer(boxData);
        }
        cursor = box.offset + box.size;
      }
    }

    for (const box of mdatBoxes) {
      let remainSize = box.size;
      while (remainSize > 0) {
        // 一次最多读取 30MB，避免内存占用过大
        const chunkSize = Math.min(remainSize, 30 * 1024 * 1024);
        const chunkOffset = box.offset + box.size - remainSize;
        const chunkData = (await reader.read(chunkSize, {
          at: chunkOffset,
        })) as MP4ArrayBuffer;
        chunkData.fileStart = chunkOffset;
        mp4boxFile.appendBuffer(chunkData);
        remainSize -= chunkSize;
      }
    }
    mp4boxFile.stop();
  }

  async function getNextBox(offset: number) {
    if (offset >= fileSize) return null;
    const buf = new Uint8Array(await reader.read(8, { at: offset }));
    const boxSize = new DataView(buf.buffer).getUint32(0);
    const boxName = String.fromCharCode(...buf.subarray(4, 8));
    return {
      name: boxName,
      offset,
      size: boxSize,
      data:
        boxName === 'mdat' ? null : await reader.read(boxSize, { at: offset }),
    };
  }
}

// /**
//  * 读取mp4 uint8 数据流的所有最外层的box
//  * @param dataArr
//  * @param maxParseNum 最多解析次数，防止非mp4文件造成过多次读取
//  * @param offset 初始的读取offset
//  * @param checkNum 是否检查解析出的box数量
//  * @returns IBox[]
//  */
// export async function getFileBoxes(
//   localFile: OPFSToolFile,
//   maxParseNum: number = 2000,
//   offset: number = 0,
//   checkNum: boolean = true,
// ): Promise<IBox[]> {
//   const HEADER_META_SIZE = 8; // byte box size + box type
//   const HEADER_LARGER_SIZE = 8;
//   const commonTypes = ['moov', 'ftyp', 'uuid', 'mdat', 'free', 'moof', 'mfra'];
//   let currentOffset = offset;
//   let currentParseTimes = 0;
//   const boxes: IBox[] = [];
//   const reader = await localFile.createReader();
//   const fSize = await localFile.getSize();
//   while (currentOffset < fSize && currentParseTimes++ < maxParseNum) {
//     let uint8a = new Uint8Array(
//       await reader.read(currentOffset + HEADER_META_SIZE, {
//         at: currentOffset,
//       }),
//     );
//     // 读取前四位
//     let boxSizeBinary = [0, 1, 2, 3].reduce((prev, cur) => {
//       return prev + uint8a[cur].toString(2).padStart(8, '0');
//     }, '');
//     let boxSize = parseInt(boxSizeBinary, 2);
//     // 读取后四位
//     let boxType = [4, 5, 6, 7].reduce((prev, cur) => {
//       return prev + String.fromCharCode(uint8a[cur]);
//     }, '');
//     if (!commonTypes.includes(boxType)) {
//       console.warn(`未知box类型: ${boxType}`);
//     }
//     if (!isAlphabetOnly(boxType)) {
//       // 非法字符直接报错
//       throw new Error('not mp4 box');
//     }
//     if (boxSize === 1) {
//       uint8a = new Uint8Array(
//         await reader.read(
//           currentOffset + HEADER_META_SIZE + HEADER_LARGER_SIZE,
//           {
//             at: currentOffset + HEADER_META_SIZE,
//           },
//         ),
//       );
//       let boxSizeBinary = [0, 1, 2, 3, 4, 5, 6, 7].reduce((prev, cur) => {
//         return prev + uint8a[cur].toString(2).padStart(8, '0');
//       }, '');
//       boxSize = parseInt(boxSizeBinary, 2);
//     }
//     boxes.push({
//       type: boxType,
//       offset: currentOffset,
//       size: boxSize,
//     });
//     currentOffset += boxSize;
//   }
//   if (boxes.length >= maxParseNum && checkNum) {
//     throw new Error('too many boxes');
//   }
//   let ftypFlag = false;
//   boxes.find((box) => {
//     if (box.type === 'ftyp') {
//       ftypFlag = true;
//       return true;
//     } else {
//       return false;
//     }
//   });
//   if (!ftypFlag) {
//     throw new Error('boxes incomplete, no ftyp');
//   }
//   return boxes;
// }

/**
 * Signed-distance sculptural mesh extraction (marching cubes + Laplacian smooth).
 * Marching cubes tables: Paul Bourke / Mikola Lysenko (isosurface).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { mergeVertices } from 'https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Javascript Marching Cubes
 *
 * Based on Paul Bourke's classic implementation:
 *    http://local.wasp.uwa.edu.au/~pbourke/geometry/polygonise/
 *
 * JS port by Mikola Lysenko
 */

var edgeTable= new Uint32Array([
      0x0  , 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
      0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
      0x190, 0x99 , 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
      0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
      0x230, 0x339, 0x33 , 0x13a, 0x636, 0x73f, 0x435, 0x53c,
      0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
      0x3a0, 0x2a9, 0x1a3, 0xaa , 0x7a6, 0x6af, 0x5a5, 0x4ac,
      0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
      0x460, 0x569, 0x663, 0x76a, 0x66 , 0x16f, 0x265, 0x36c,
      0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
      0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff , 0x3f5, 0x2fc,
      0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
      0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55 , 0x15c,
      0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
      0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc ,
      0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
      0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
      0xcc , 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
      0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
      0x15c, 0x55 , 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
      0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
      0x2fc, 0x3f5, 0xff , 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
      0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
      0x36c, 0x265, 0x16f, 0x66 , 0x76a, 0x663, 0x569, 0x460,
      0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
      0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa , 0x1a3, 0x2a9, 0x3a0,
      0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
      0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33 , 0x339, 0x230,
      0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
      0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99 , 0x190,
      0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
      0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0   ])
  , triTable = [
      [],
      [0, 8, 3],
      [0, 1, 9],
      [1, 8, 3, 9, 8, 1],
      [1, 2, 10],
      [0, 8, 3, 1, 2, 10],
      [9, 2, 10, 0, 2, 9],
      [2, 8, 3, 2, 10, 8, 10, 9, 8],
      [3, 11, 2],
      [0, 11, 2, 8, 11, 0],
      [1, 9, 0, 2, 3, 11],
      [1, 11, 2, 1, 9, 11, 9, 8, 11],
      [3, 10, 1, 11, 10, 3],
      [0, 10, 1, 0, 8, 10, 8, 11, 10],
      [3, 9, 0, 3, 11, 9, 11, 10, 9],
      [9, 8, 10, 10, 8, 11],
      [4, 7, 8],
      [4, 3, 0, 7, 3, 4],
      [0, 1, 9, 8, 4, 7],
      [4, 1, 9, 4, 7, 1, 7, 3, 1],
      [1, 2, 10, 8, 4, 7],
      [3, 4, 7, 3, 0, 4, 1, 2, 10],
      [9, 2, 10, 9, 0, 2, 8, 4, 7],
      [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4],
      [8, 4, 7, 3, 11, 2],
      [11, 4, 7, 11, 2, 4, 2, 0, 4],
      [9, 0, 1, 8, 4, 7, 2, 3, 11],
      [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1],
      [3, 10, 1, 3, 11, 10, 7, 8, 4],
      [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4],
      [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3],
      [4, 7, 11, 4, 11, 9, 9, 11, 10],
      [9, 5, 4],
      [9, 5, 4, 0, 8, 3],
      [0, 5, 4, 1, 5, 0],
      [8, 5, 4, 8, 3, 5, 3, 1, 5],
      [1, 2, 10, 9, 5, 4],
      [3, 0, 8, 1, 2, 10, 4, 9, 5],
      [5, 2, 10, 5, 4, 2, 4, 0, 2],
      [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8],
      [9, 5, 4, 2, 3, 11],
      [0, 11, 2, 0, 8, 11, 4, 9, 5],
      [0, 5, 4, 0, 1, 5, 2, 3, 11],
      [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5],
      [10, 3, 11, 10, 1, 3, 9, 5, 4],
      [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10],
      [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3],
      [5, 4, 8, 5, 8, 10, 10, 8, 11],
      [9, 7, 8, 5, 7, 9],
      [9, 3, 0, 9, 5, 3, 5, 7, 3],
      [0, 7, 8, 0, 1, 7, 1, 5, 7],
      [1, 5, 3, 3, 5, 7],
      [9, 7, 8, 9, 5, 7, 10, 1, 2],
      [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3],
      [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2],
      [2, 10, 5, 2, 5, 3, 3, 5, 7],
      [7, 9, 5, 7, 8, 9, 3, 11, 2],
      [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11],
      [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7],
      [11, 2, 1, 11, 1, 7, 7, 1, 5],
      [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11],
      [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0],
      [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0],
      [11, 10, 5, 7, 11, 5],
      [10, 6, 5],
      [0, 8, 3, 5, 10, 6],
      [9, 0, 1, 5, 10, 6],
      [1, 8, 3, 1, 9, 8, 5, 10, 6],
      [1, 6, 5, 2, 6, 1],
      [1, 6, 5, 1, 2, 6, 3, 0, 8],
      [9, 6, 5, 9, 0, 6, 0, 2, 6],
      [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8],
      [2, 3, 11, 10, 6, 5],
      [11, 0, 8, 11, 2, 0, 10, 6, 5],
      [0, 1, 9, 2, 3, 11, 5, 10, 6],
      [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11],
      [6, 3, 11, 6, 5, 3, 5, 1, 3],
      [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6],
      [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9],
      [6, 5, 9, 6, 9, 11, 11, 9, 8],
      [5, 10, 6, 4, 7, 8],
      [4, 3, 0, 4, 7, 3, 6, 5, 10],
      [1, 9, 0, 5, 10, 6, 8, 4, 7],
      [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4],
      [6, 1, 2, 6, 5, 1, 4, 7, 8],
      [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7],
      [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6],
      [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9],
      [3, 11, 2, 7, 8, 4, 10, 6, 5],
      [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11],
      [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6],
      [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6],
      [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6],
      [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11],
      [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7],
      [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9],
      [10, 4, 9, 6, 4, 10],
      [4, 10, 6, 4, 9, 10, 0, 8, 3],
      [10, 0, 1, 10, 6, 0, 6, 4, 0],
      [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10],
      [1, 4, 9, 1, 2, 4, 2, 6, 4],
      [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4],
      [0, 2, 4, 4, 2, 6],
      [8, 3, 2, 8, 2, 4, 4, 2, 6],
      [10, 4, 9, 10, 6, 4, 11, 2, 3],
      [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6],
      [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10],
      [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1],
      [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3],
      [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1],
      [3, 11, 6, 3, 6, 0, 0, 6, 4],
      [6, 4, 8, 11, 6, 8],
      [7, 10, 6, 7, 8, 10, 8, 9, 10],
      [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10],
      [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0],
      [10, 6, 7, 10, 7, 1, 1, 7, 3],
      [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7],
      [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9],
      [7, 8, 0, 7, 0, 6, 6, 0, 2],
      [7, 3, 2, 6, 7, 2],
      [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7],
      [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7],
      [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11],
      [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1],
      [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6],
      [0, 9, 1, 11, 6, 7],
      [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0],
      [7, 11, 6],
      [7, 6, 11],
      [3, 0, 8, 11, 7, 6],
      [0, 1, 9, 11, 7, 6],
      [8, 1, 9, 8, 3, 1, 11, 7, 6],
      [10, 1, 2, 6, 11, 7],
      [1, 2, 10, 3, 0, 8, 6, 11, 7],
      [2, 9, 0, 2, 10, 9, 6, 11, 7],
      [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8],
      [7, 2, 3, 6, 2, 7],
      [7, 0, 8, 7, 6, 0, 6, 2, 0],
      [2, 7, 6, 2, 3, 7, 0, 1, 9],
      [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6],
      [10, 7, 6, 10, 1, 7, 1, 3, 7],
      [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8],
      [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7],
      [7, 6, 10, 7, 10, 8, 8, 10, 9],
      [6, 8, 4, 11, 8, 6],
      [3, 6, 11, 3, 0, 6, 0, 4, 6],
      [8, 6, 11, 8, 4, 6, 9, 0, 1],
      [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6],
      [6, 8, 4, 6, 11, 8, 2, 10, 1],
      [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6],
      [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9],
      [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3],
      [8, 2, 3, 8, 4, 2, 4, 6, 2],
      [0, 4, 2, 4, 6, 2],
      [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8],
      [1, 9, 4, 1, 4, 2, 2, 4, 6],
      [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1],
      [10, 1, 0, 10, 0, 6, 6, 0, 4],
      [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3],
      [10, 9, 4, 6, 10, 4],
      [4, 9, 5, 7, 6, 11],
      [0, 8, 3, 4, 9, 5, 11, 7, 6],
      [5, 0, 1, 5, 4, 0, 7, 6, 11],
      [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5],
      [9, 5, 4, 10, 1, 2, 7, 6, 11],
      [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5],
      [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2],
      [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6],
      [7, 2, 3, 7, 6, 2, 5, 4, 9],
      [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7],
      [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0],
      [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8],
      [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7],
      [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4],
      [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10],
      [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10],
      [6, 9, 5, 6, 11, 9, 11, 8, 9],
      [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5],
      [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11],
      [6, 11, 3, 6, 3, 5, 5, 3, 1],
      [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6],
      [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10],
      [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5],
      [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3],
      [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2],
      [9, 5, 6, 9, 6, 0, 0, 6, 2],
      [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8],
      [1, 5, 6, 2, 1, 6],
      [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6],
      [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0],
      [0, 3, 8, 5, 6, 10],
      [10, 5, 6],
      [11, 5, 10, 7, 5, 11],
      [11, 5, 10, 11, 7, 5, 8, 3, 0],
      [5, 11, 7, 5, 10, 11, 1, 9, 0],
      [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1],
      [11, 1, 2, 11, 7, 1, 7, 5, 1],
      [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11],
      [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7],
      [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2],
      [2, 5, 10, 2, 3, 5, 3, 7, 5],
      [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5],
      [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2],
      [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2],
      [1, 3, 5, 3, 7, 5],
      [0, 8, 7, 0, 7, 1, 1, 7, 5],
      [9, 0, 3, 9, 3, 5, 5, 3, 7],
      [9, 8, 7, 5, 9, 7],
      [5, 8, 4, 5, 10, 8, 10, 11, 8],
      [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0],
      [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5],
      [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4],
      [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8],
      [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11],
      [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5],
      [9, 4, 5, 2, 11, 3],
      [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4],
      [5, 10, 2, 5, 2, 4, 4, 2, 0],
      [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9],
      [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2],
      [8, 4, 5, 8, 5, 3, 3, 5, 1],
      [0, 4, 5, 1, 0, 5],
      [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5],
      [9, 4, 5],
      [4, 11, 7, 4, 9, 11, 9, 10, 11],
      [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11],
      [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11],
      [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4],
      [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2],
      [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3],
      [11, 7, 4, 11, 4, 2, 2, 4, 0],
      [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4],
      [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9],
      [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7],
      [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10],
      [1, 10, 2, 8, 7, 4],
      [4, 9, 1, 4, 1, 7, 7, 1, 3],
      [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1],
      [4, 0, 3, 7, 4, 3],
      [4, 8, 7],
      [9, 10, 8, 10, 11, 8],
      [3, 0, 9, 3, 9, 11, 11, 9, 10],
      [0, 1, 10, 0, 10, 8, 8, 10, 11],
      [3, 1, 10, 11, 3, 10],
      [1, 2, 11, 1, 11, 9, 9, 11, 8],
      [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9],
      [0, 2, 11, 8, 0, 11],
      [3, 2, 11],
      [2, 3, 8, 2, 8, 10, 10, 8, 9],
      [9, 10, 2, 0, 9, 2],
      [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8],
      [1, 10, 2],
      [1, 3, 8, 9, 1, 8],
      [0, 9, 1],
      [0, 3, 8],
      []]
  , cubeVerts = [
     [0,0,0]
    ,[1,0,0]
    ,[1,1,0]
    ,[0,1,0]
    ,[0,0,1]
    ,[1,0,1]
    ,[1,1,1]
    ,[0,1,1]]
  , edgeIndex = [ [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7] ];



function marchingCubes(dims, potential, bounds) {
  if(!bounds) {
    bounds = [[0,0,0], dims];
  }
  var scale     = [0,0,0];
  var shift     = [0,0,0];
  for(var i=0; i<3; ++i) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }

  var vertices = []
    , faces = []
    , n = 0
    , grid = new Array(8)
    , edges = new Array(12)
    , x = [0,0,0];
  //March over the volume
  for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0])
  for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n)
  for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n) {
    //For each cell, compute cube mask
    var cube_index = 0;
    for(var i=0; i<8; ++i) {
      var v = cubeVerts[i]
        , s = potential(
          scale[0]*(x[0]+v[0])+shift[0],
          scale[1]*(x[1]+v[1])+shift[1],
          scale[2]*(x[2]+v[2])+shift[2]);
      grid[i] = s;
      cube_index |= (s > 0) ? 1 << i : 0;
    }
    //Compute vertices
    var edge_mask = edgeTable[cube_index];
    if(edge_mask === 0) {
      continue;
    }
    for(var i=0; i<12; ++i) {
      if((edge_mask & (1<<i)) === 0) {
        continue;
      }
      edges[i] = vertices.length;
      var nv = [0,0,0]
        , e = edgeIndex[i]
        , p0 = cubeVerts[e[0]]
        , p1 = cubeVerts[e[1]]
        , a = grid[e[0]]
        , b = grid[e[1]]
        , d = a - b
        , t = 0;
      if(Math.abs(d) > 1e-6) {
        t = a / d;
      }
      for(var j=0; j<3; ++j) {
        nv[j] = scale[j] * ((x[j] + p0[j]) + t * (p1[j] - p0[j])) + shift[j];
      }
      vertices.push(nv);
    }
    //Add faces
    var f = triTable[cube_index];
    for(var i=0; i<f.length; i += 3) {
      faces.push([edges[f[i]], edges[f[i+1]], edges[f[i+2]]]);
    }
  }
  return { positions: vertices, cells: faces };
}

function distanceTransform(grid, w, h) {
  const INF = 1e7;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < grid.length; i++) dist[i] = grid[i] ? INF : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) m = Math.min(m, dist[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 1.414213562);
      if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 1.414213562);
      dist[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x < w - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 1.414213562);
      if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 1.414213562);
      dist[i] = m;
    }
  }
  return dist;
}

function distanceToMaskGrid(maskGrid, w, h) {
  const INF = 1e7;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < maskGrid.length; i++) dist[i] = maskGrid[i] ? 0 : INF;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) m = Math.min(m, dist[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 1.414213562);
      if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 1.414213562);
      dist[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x < w - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 1.414213562);
      if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 1.414213562);
      dist[i] = m;
    }
  }
  return dist;
}

function sampleMaskField(px, py, params) {
  const { grid, w, h, distIn, distOut, maskScale } = params;
  if (px < -0.5 || px > w - 0.5 || py < -0.5 || py > h - 0.5) {
    const ox = px < 0 ? -px : px > w - 1 ? px - (w - 1) : 0;
    const oy = py < 0 ? -py : py > h - 1 ? py - (h - 1) : 0;
    return { inside: false, distIn: 0, distOut: Math.hypot(ox, oy) + 2 };
  }
  const ix = Math.max(0, Math.min(w - 1, Math.round(px)));
  const iy = Math.max(0, Math.min(h - 1, Math.round(py)));
  const i = iy * w + ix;
  return { inside: !!grid[i], distIn: distIn[i], distOut: distOut[i] };
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

function buildSegmentSpatialIndex(segments, cellSize) {
  let minX = Infinity;
  let minY = Infinity;
  for (const seg of segments) {
    minX = Math.min(minX, seg.ax, seg.bx);
    minY = Math.min(minY, seg.ay, seg.by);
  }
  const buckets = new Map();
  const add = (cx, cy, si) => {
    const k = cx + ',' + cy;
    let list = buckets.get(k);
    if (!list) {
      list = [];
      buckets.set(k, list);
    }
    list.push(si);
  };
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const c0 = Math.floor((Math.min(seg.ax, seg.bx) - minX) / cellSize);
    const c1 = Math.floor((Math.max(seg.ax, seg.bx) - minX) / cellSize);
    const r0 = Math.floor((Math.min(seg.ay, seg.by) - minY) / cellSize);
    const r1 = Math.floor((Math.max(seg.ay, seg.by) - minY) / cellSize);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) add(c, r, si);
    }
  }
  return { buckets, minX, minY, cellSize };
}

function nearestTubeDist(x, y, segments, segmentIndex) {
  if (!segments.length) return Infinity;
  if (!segmentIndex) {
    let best = Infinity;
    for (const seg of segments) {
      best = Math.min(best, distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by));
    }
    return best;
  }
  const { buckets, minX, minY, cellSize } = segmentIndex;
  const cx = Math.floor((x - minX) / cellSize);
  const cy = Math.floor((y - minY) / cellSize);
  let best = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const list = buckets.get(cx + dx + ',' + (cy + dy));
      if (!list) continue;
      for (const si of list) {
        const seg = segments[si];
        best = Math.min(best, distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by));
      }
    }
  }
  if (best === Infinity) {
    for (const seg of segments) {
      best = Math.min(best, distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by));
    }
  }
  return best;
}

/** Union SDF — elliptical cradle wrapping the metal plate (seat + collar). */
function metalPlateCradleSdfAt(x, y, z, params) {
  const c = params.metalPlateCradle;
  if (!c) return 1e6;

  const { cx, cy, rx, ry, roundR, wrapR, collarH, seatDepth, maxH } = c;
  const dx = x - cx;
  const dy = y - cy;
  const innerNd = Math.sqrt((dx / Math.max(rx, 1)) ** 2 + (dy / Math.max(ry, 1)) ** 2);
  const outerRx = rx + wrapR;
  const outerRy = ry + wrapR;
  const outerNd = Math.sqrt((dx / outerRx) ** 2 + (dy / outerRy) ** 2);

  if (outerNd > 1.04) return 1e6;

  const outerPhi = (outerNd - 1) * Math.min(outerRx, outerRy);
  let hSurf;

  if (innerNd <= 1) {
    const centerT = innerNd;
    hSurf = maxH * 0.78 - seatDepth * (1 - centerT * 0.28);
  } else {
    const ringSpan = Math.max(wrapR / Math.min(rx, ry), 0.08);
    const ringT = Math.min(1, (innerNd - 1) / ringSpan);
    const rimT = Math.sin((1 - ringT) * Math.PI * 0.5);
    hSurf = maxH * 0.58 + collarH * rimT;
  }

  const basePad = roundR * 0.26;
  const sdfZ = Math.max(z - hSurf, -(z + basePad));
  return Math.max(outerPhi, sdfZ) - roundR * 0.09;
}

/** Slab + name-tube body: soft domed lobes on a plate — no vertical cliff at silhouette. */
function slabTubeStoneSdfAt(x, y, z, params) {
  const { segments, segmentIndex, roundR, maxH } = params;
  const dist2d = nearestTubeDist(x, y, segments, segmentIndex);
  const softR = roundR * 1.04;
  const phi2d = dist2d - softR;
  const crossT = Math.min(1, dist2d / Math.max(softR * 1.15, 0.001));
  const domeT = Math.pow(Math.max(0, 1 - crossT), 0.38);
  const baseH = params.basePlateHeight ?? maxH * 0.3;
  const peakH = maxH * 1.04;
  let hSurf = baseH + (peakH - baseH) * domeT;

  const crestT = Math.pow(Math.max(0, 1 - crossT * 1.05), 0.55);
  hSurf += (peakH - baseH) * 0.14 * crestT;

  const coreR = roundR * 0.55;
  const valleyOuter = roundR * 2.6;
  if (dist2d > coreR && dist2d < valleyOuter) {
    const t = (dist2d - coreR) / (valleyOuter - coreR);
    hSurf -= (peakH - baseH) * 0.38 * Math.pow(Math.sin(t * Math.PI * 0.5), 1.05);
    hSurf = Math.max(baseH * 0.92, hSurf);
  }

  const swell =
    (aoGrainHash(x * 0.31 + 3.7, y * 0.29 + 2.1) - 0.5) * roundR * 0.1 +
    (aoGrainHash(x * 0.67 + 9.2, y * 0.61 + 6.4) - 0.5) * roundR * 0.04;
  hSurf += swell;

  hSurf -= metalBedDepthAt(x, y, params);
  hSurf += metalBedShoulderAt(x, y, params);
  hSurf -= effectiveEngraveDepthAt(x, y, params);

  const basePad = roundR * 0.5;
  const sdfZ = Math.max(z - hSurf, -(z + basePad));
  let letterSdf = Math.max(phi2d, sdfZ) - roundR * 0.14;

  if (params.metalPlateCradle) {
    const cradleSdf = metalPlateCradleSdfAt(x, y, z, params);
    letterSdf = Math.min(letterSdf, cradleSdf);
  }

  return letterSdf;
}

/** Union of rounded tube capsules along L3 stroke centerlines */
function tubeStoneSdfAt(x, y, z, params) {
  const { segments, segmentIndex, roundR, maxH } = params;
  const dist2d = nearestTubeDist(x, y, segments, segmentIndex);
  const phi2d = dist2d - roundR;
  const crossT = Math.min(1, dist2d / Math.max(roundR, 0.001));
  const domeT = Math.max(0, 1 - crossT * crossT);
  let hSurf = maxH * Math.pow(domeT, 0.46);

  const coreR = roundR * 0.76;
  const valleyOuter = roundR * 2.2;
  if (dist2d > coreR && dist2d < valleyOuter) {
    const t = (dist2d - coreR) / (valleyOuter - coreR);
    hSurf -= maxH * 0.14 * Math.pow(Math.sin(t * Math.PI), 1.05);
  }

  hSurf -= metalBedDepthAt(x, y, params);
  hSurf += metalBedShoulderAt(x, y, params);

  const basePad = roundR * 0.22;
  const sdfZ = Math.max(z - hSurf, -(z + basePad));
  let letterSdf = Math.max(phi2d, sdfZ) - roundR * 0.06;

  if (params.metalPlateCradle) {
    const cradleSdf = metalPlateCradleSdfAt(x, y, z, params);
    letterSdf = Math.min(letterSdf, cradleSdf);
  }

  return letterSdf;
}

function heightFromStrokeUnion(
  x,
  y,
  segments,
  segmentIndex,
  tubeR,
  peakH,
  profile = 'dome',
  ripple = 0
) {
  if (!segments?.length || peakH <= 0) return 0;
  const limit = tubeR * 1.12;
  let best = 0;

  const consider = (seg) => {
    const dist = distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by);
    if (dist > limit) return;
    const crossT = Math.min(1, dist / Math.max(tubeR, 0.001));
    let h;
    if (profile === 'groove') {
      h = peakH * Math.pow(Math.cos(crossT * Math.PI * 0.5), 0.82);
    } else {
      const domeT = Math.max(0, 1 - crossT * crossT);
      h = peakH * Math.pow(domeT, 0.58);
      if (ripple > 0 && seg.arcStart != null) {
        const wave = 1 - ripple + ripple * (0.5 + 0.5 * Math.sin(seg.arcStart * Math.PI * 2 * 5.2));
        h *= wave;
      }
    }
    best = Math.max(best, h);
  };

  if (segmentIndex) {
    const { buckets, minX, minY, cellSize } = segmentIndex;
    const cx = Math.floor((x - minX) / cellSize);
    const cy = Math.floor((y - minY) / cellSize);
    const rad = Math.max(2, Math.ceil(limit / Math.max(cellSize, 0.001)));
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const list = buckets.get(cx + dx + ',' + (cy + dy));
        if (!list) continue;
        for (const si of list) consider(segments[si]);
      }
    }
  } else {
    for (const seg of segments) consider(seg);
  }
  return best;
}

/** True when (x,y) lies inside any emboss stroke tube — engrave skipped there. */
function insideEmbossTubeAt(x, y, params) {
  if (!params.embossSegments?.length && !params.embossDetailSegments?.length) {
    return insideEmbossOverlayAt(x, y, params);
  }
  return embossHeightAt(x, y, params) > params.roundR * 0.04;
}

function embossOuterTubeR(params) {
  let r = params.embossTubeR ?? params.roundR * 0.5;
  if (params.embossDetailTubeR) r = Math.max(r, params.embossDetailTubeR);
  return r;
}

/** Shallow bed carved for metal tubes to sit in — stone + metal live together. */
function metalBedDepthAt(x, y, params) {
  if (!params.metalBedSegments?.length) return 0;
  const tubeR = params.metalBedTubeR ?? params.roundR * 0.35;
  const depth = params.metalBedDepth ?? params.roundR * 0.2;
  return heightFromStrokeUnion(
    x,
    y,
    params.metalBedSegments,
    params.metalBedSegmentIndex,
    tubeR,
    depth,
    'groove'
  );
}

/** Raised stone shoulder at groove walls — stamped pedestal the metal sits on. */
function metalBedShoulderAt(x, y, params) {
  if (!params.metalBedSegments?.length) return 0;
  const tubeR = params.metalBedTubeR ?? params.roundR * 0.35;
  const shoulderH = params.metalBedShoulder ?? params.roundR * 0.22;
  const dist = nearestTubeDist(
    x,
    y,
    params.metalBedSegments,
    params.metalBedSegmentIndex
  );
  const inner = tubeR * 0.62;
  const outer = tubeR * 1.55;
  if (dist < inner || dist > outer) return 0;
  const t = (dist - inner) / Math.max(outer - inner, 0.001);
  const rimT = Math.sin(t * Math.PI * 0.5);
  const bed = metalBedDepthAt(x, y, params);
  if (bed < params.roundR * 0.04) return 0;
  return shoulderH * rimT * Math.min(1, bed / Math.max(shoulderH, 0.001));
}

/** Engrave depth — sunk into stone, suppressed only under raised emboss. */
function effectiveEngraveDepthAt(x, y, params) {
  let depth = engraveDepthAt(x, y, params);
  if (depth <= 0) return 0;

  const maxSink = params.maxEngraveSink ?? params.maxH * (params.maxEngraveSinkFrac ?? 0.58);
  depth = Math.min(depth, maxSink);

  const embossH = embossHeightAt(x, y, params);
  if (embossH > params.roundR * 0.05) return 0;

  if (params.embossSegments?.length) {
    const embossTubeR = params.embossTubeR ?? params.roundR * 0.5;
    const gap = params.engraveEmbossGap ?? params.roundR * 0.14;
    const dist = nearestTubeDist(x, y, params.embossSegments, params.embossSegmentIndex);
    if (dist < embossTubeR + gap) {
      const t = Math.max(0, Math.min(1, (dist - embossTubeR * 0.82) / Math.max(gap, 0.001)));
      depth *= t * t * (3 - 2 * t);
    }
  }
  return depth;
}

/** Max carve depth from engrave stroke tubes or typography overlays (slab mode). */
function engraveDepthAt(x, y, params) {
  if (params.engraveSegments?.length) {
    const tubeR = params.engraveTubeR ?? params.roundR * 0.35;
    const depth = params.engraveDepth ?? params.roundR * 0.5;
    return heightFromStrokeUnion(
      x,
      y,
      params.engraveSegments,
      params.engraveSegmentIndex,
      tubeR,
      depth,
      'groove'
    );
  }
  let depth = 0;
  for (const ov of params.engraveOverlays || []) {
    const px = (x - ov.maskOrigin.minX) * ov.maskScale;
    const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
    const s = sampleMaskField(px, py, ov);
    if (!s.inside) continue;
    const din = s.distIn / ov.maskScale;
    const edgeW = ov.edgeWidth ?? params.roundR * 0.32;
    const t = Math.min(1, din / Math.max(edgeW, 0.01));
    depth = Math.max(depth, ov.depth * Math.sin(t * Math.PI * 0.5));
  }
  return depth;
}

/** Raised height above slab surface from emboss stroke tubes or mask overlays. */
function embossHeightAt(x, y, params) {
  let height = 0;
  if (params.embossSegments?.length) {
    const tubeR = params.embossTubeR ?? params.roundR * 0.5;
    const extraH = params.embossHeight ?? params.roundR * 2.2;
    height = Math.max(
      height,
      heightFromStrokeUnion(
        x,
        y,
        params.embossSegments,
        params.embossSegmentIndex,
        tubeR,
        extraH,
        'dome',
        params.embossRipple ?? 0
      )
    );
  }
  if (params.embossDetailSegments?.length) {
    const tubeR = params.embossDetailTubeR ?? params.roundR * 0.28;
    const extraH = params.embossDetailHeight ?? params.roundR * 1.1;
    height = Math.max(
      height,
      heightFromStrokeUnion(
        x,
        y,
        params.embossDetailSegments,
        params.embossDetailSegmentIndex,
        tubeR,
        extraH
      )
    );
  }
  if (height > 0) return height;
  for (const ov of params.embossOverlays || []) {
    const px = (x - ov.maskOrigin.minX) * ov.maskScale;
    const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
    const s = sampleMaskField(px, py, ov);
    if (!s.inside) continue;
    const din = s.distIn / ov.maskScale;
    const bevelW = ov.bevelWidth ?? params.roundR * 0.55;
    const maxIn = Math.max(bevelW * 1.4, ov.maxDistInScene * 0.92);
    const centerT = Math.min(1, din / Math.max(maxIn, 0.01));
    const domeT = Math.sin(centerT * Math.PI * 0.5);
    const edgeT = Math.min(1, din / Math.max(bevelW, 0.01));
    const edgeSmooth = edgeT * edgeT * (3 - 2 * edgeT);
    height = Math.max(height, ov.height * domeT * edgeSmooth);
  }
  return height;
}

/** True when (x,y) lies inside any emboss glyph mask — engrave skipped there so emboss sits on top. */
function insideEmbossOverlayAt(x, y, params) {
  for (const ov of params.embossOverlays || []) {
    const px = (x - ov.maskOrigin.minX) * ov.maskScale;
    const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
    const s = sampleMaskField(px, py, ov);
    if (s.inside) return true;
  }
  return false;
}

/** Carved U-groove along glyph stroke centerlines — same tube model as L3 stone. */
function engraveTubeCutSdfAt(x, y, z, params) {
  if (!params.engraveSegments?.length) return -1e6;
  if (insideEmbossTubeAt(x, y, params)) return -1e6;

  const tubeR = params.engraveTubeR ?? params.roundR * 0.35;
  const depth = params.engraveDepth ?? params.roundR * 0.5;
  const { maxH, roundR } = params;
  const dist2d = nearestTubeDist(x, y, params.engraveSegments, params.engraveSegmentIndex);
  if (dist2d > tubeR * 1.3) return -1e6;

  const crossT = Math.min(1, dist2d / Math.max(tubeR, 0.001));
  const uDepth = depth * Math.cos(crossT * Math.PI * 0.5);
  if (uDepth < roundR * 0.006) return -1e6;

  const lip = maxH + roundR * 0.012;
  const rx = Math.max(0, tubeR * 0.88 - dist2d);
  const coreZ = lip - uDepth * 0.9;
  const rz = z - coreZ;
  const capR = uDepth * 0.44;
  const capDist = Math.hypot(rx, rz) - capR;
  if (z <= lip + roundR * 0.025 && capDist < 0) return -capDist;
  return -1e6;
}

/** Raised bas-relief along glyph stroke centerlines — same dome profile as L3 tubeStoneSdfAt. */
function embossTubeUnionSdfAt(x, y, z, params) {
  if (!params.embossSegments?.length) return 1e6;

  const tubeR = params.embossTubeR ?? params.roundR * 0.5;
  const extraH = params.embossHeight ?? params.roundR * 2.2;
  const { maxH, roundR } = params;
  const dist2d = nearestTubeDist(x, y, params.embossSegments, params.embossSegmentIndex);
  const phi2d = dist2d - tubeR;
  const crossT = Math.min(1, dist2d / Math.max(tubeR, 0.001));
  const domeT = Math.max(0, 1 - crossT * crossT);
  const hPeak = maxH + extraH * Math.pow(domeT, 0.58);
  const footZ = maxH - roundR * 0.12;
  const sdfZ = Math.max(z - hPeak, -(z + footZ));
  return Math.max(phi2d, sdfZ) - roundR * 0.09;
}

/** Carved U-groove — rounded cross-section like hand-carved stone (reference). */
function engraveCutSdfAt(x, y, z, params) {
  if (!params.engraveOverlays?.length) return -1e6;
  if (insideEmbossOverlayAt(x, y, params)) return -1e6;
  let carveSdf = -1e6;
  const { maxH, roundR } = params;
  const lip = maxH + roundR * 0.015;
  for (const ov of params.engraveOverlays) {
    const px = (x - ov.maskOrigin.minX) * ov.maskScale;
    const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
    const s = sampleMaskField(px, py, ov);
    if (!s.inside) continue;
    const din = s.distIn / ov.maskScale;
    const halfW = ov.edgeWidth ?? roundR * 0.32;
    const t = Math.min(1, din / Math.max(halfW, 0.01));
    const uDepth = ov.depth * Math.sin(t * Math.PI * 0.5);
    if (uDepth < roundR * 0.008) continue;
    const rx = Math.max(0, halfW * 0.92 - din);
    const grooveCore = lip - uDepth * 0.88;
    const rz = z - grooveCore;
    const tubeR = uDepth * 0.42;
    const dist = Math.hypot(rx, rz) - tubeR;
    if (dist < 0 && z <= lip + roundR * 0.02) carveSdf = Math.max(carveSdf, -dist);
  }
  return carveSdf;
}

/** Raised bas-relief — smooth dome mound from mask distance (solid rounded letterforms). */
function embossUnionSdfAt(x, y, z, params) {
  if (!params.embossOverlays?.length) return 1e6;
  let best = 1e6;
  const { roundR, maxH } = params;
  for (const ov of params.embossOverlays) {
    const px = (x - ov.maskOrigin.minX) * ov.maskScale;
    const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
    const s = sampleMaskField(px, py, ov);
    if (!s.inside) {
      best = Math.min(best, s.distOut / ov.maskScale + roundR * 0.28);
      continue;
    }
    const din = s.distIn / ov.maskScale;
    const bevelW = ov.bevelWidth ?? roundR * 0.55;
    const maxIn = Math.max(bevelW * 1.4, ov.maxDistInScene * 0.92);
    const centerT = Math.min(1, din / Math.max(maxIn, 0.01));
    const domeT = Math.sin(centerT * Math.PI * 0.5);
    const edgeT = Math.min(1, din / Math.max(bevelW, 0.01));
    const edgeSmooth = edgeT * edgeT * (3 - 2 * edgeT);
    const hPeak = maxH + ov.height * domeT * edgeSmooth;
    const footZ = maxH - roundR * 0.1;
    const phi2d = roundR * 0.16 - din * 0.12;
    const sdfZ = Math.max(z - hPeak, -(z + footZ));
    best = Math.min(best, Math.max(phi2d, sdfZ) - roundR * 0.06);
  }
  return best;
}

function stoneSdfAt(x, y, z, params) {
  if (params.segments?.length && params.slabMode) return slabTubeStoneSdfAt(x, y, z, params);
  if (params.segments?.length) return tubeStoneSdfAt(x, y, z, params);
  const px = (x - params.maskOrigin.minX) * params.maskScale;
  const py = (params.maskOrigin.maxY - y) * params.maskScale;
  const { maskScale, roundR, maxH, maxDistInScene } = params;
  const s = sampleMaskField(px, py, params);

  if (!s.inside) {
    const outside = s.distOut / maskScale + roundR * 0.12;
    if (params.embossOverlays?.length) {
      return Math.min(outside, embossUnionSdfAt(x, y, z, params));
    }
    return outside;
  }

  const din = s.distIn / maskScale;
  const phi2d = roundR - din;
  const hasStrokeRelief =
    (params.engraveSegments?.length || 0) +
      (params.embossSegments?.length || 0) +
      (params.embossDetailSegments?.length || 0) >
    0;
  const hasOverlayRelief =
    (params.engraveOverlays?.length || 0) + (params.embossOverlays?.length || 0) > 0;

  if (params.slabMode && (hasStrokeRelief || hasOverlayRelief)) {
    const edgeT = Math.min(1, din / Math.max(roundR * 1.1, 0.01));
    const domeT = Math.sin(edgeT * Math.PI * 0.5);
    const baseH = params.basePlateHeight ?? maxH * 0.4;
    const lobePeak = maxH * (0.88 + 0.12 * domeT);
    let hSurf = baseH + (lobePeak - baseH) * domeT;
    const embossH = embossHeightAt(x, y, params);
    if (embossH > roundR * 0.02) hSurf += embossH;
    hSurf -= metalBedDepthAt(x, y, params);
    hSurf += metalBedShoulderAt(x, y, params);
    hSurf -= effectiveEngraveDepthAt(x, y, params);
    hSurf = Math.max(baseH * 0.94, hSurf);
    const basePad = roundR * 0.5;
    const sdfZ = Math.max(z - hSurf, -(z + basePad));
    return Math.max(phi2d, sdfZ) - roundR * 0.06;
  }

  let hSurf;
  if (params.slabMode) {
    const edgeT = Math.min(1, din / Math.max(roundR * 1.1, 0.01));
    const domeT = Math.sin(edgeT * Math.PI * 0.5);
    const baseH = params.basePlateHeight ?? maxH * 0.4;
    const lobePeak = maxH * (0.92 + 0.08 * domeT);
    hSurf = baseH + (lobePeak - baseH) * domeT;
    hSurf -= metalBedDepthAt(x, y, params);
    hSurf += metalBedShoulderAt(x, y, params);
    hSurf = Math.max(baseH * 0.94, hSurf);
  } else {
    const t = Math.min(1, din / Math.max(maxDistInScene, 0.001));
    const domeT = Math.max(0, 1 - (1 - t) * (1 - t));
    hSurf = maxH * Math.pow(domeT, 0.58);
  }
  const basePad = params.slabMode ? roundR * 0.5 : roundR * 0.32;
  const sdfZ = Math.max(z - hSurf, -(z + basePad));
  return Math.max(phi2d, sdfZ) - roundR * (params.slabMode ? 0.06 : 0.1);
}

/**
 * Precompute distance fields for a Hebrew text mask positioned in scene space.
 * @returns {{ grid, w, h, distIn, distOut, maskOrigin, maskScale, maxDistInScene }}
 */
export function prepareTextOverlayFromGrid(grid, w, h, maskOrigin, maskScale) {
  const distIn = distanceTransform(grid, w, h);
  const distOut = distanceToMaskGrid(grid, w, h);
  let maxDistIn = 1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] && distIn[i] < 1e6) maxDistIn = Math.max(maxDistIn, distIn[i]);
  }
  return { grid, w, h, distIn, distOut, maskOrigin, maskScale, maxDistInScene: maxDistIn / maskScale };
}

function buildAdjacency(indexArray, vertCount) {
  const adj = Array.from({ length: vertCount }, () => new Set());
  for (let i = 0; i < indexArray.length; i += 3) {
    const a = indexArray[i];
    const b = indexArray[i + 1];
    const c = indexArray[i + 2];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return adj;
}

function laplacianSmoothGeometry(geom, iterations = 5, lambda = 0.42) {
  const pos = geom.attributes.position;
  const index = geom.index;
  if (!index) return geom;
  const adj = buildAdjacency(index.array, pos.count);
  const buf = new Float32Array(pos.count * 3);

  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < pos.count; i++) {
      const nbrs = adj[i];
      if (!nbrs.size) {
        buf[i * 3] = pos.getX(i);
        buf[i * 3 + 1] = pos.getY(i);
        buf[i * 3 + 2] = pos.getZ(i);
        continue;
      }
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const j of nbrs) {
        sx += pos.getX(j);
        sy += pos.getY(j);
        sz += pos.getZ(j);
      }
      const inv = 1 / nbrs.size;
      buf[i * 3] = pos.getX(i) + lambda * (sx * inv - pos.getX(i));
      buf[i * 3 + 1] = pos.getY(i) + lambda * (sy * inv - pos.getY(i));
      buf[i * 3 + 2] = pos.getZ(i) + lambda * (sz * inv - pos.getZ(i));
    }
    pos.array.set(buf);
    pos.needsUpdate = true;
  }
  return geom;
}

function mcResultToGeometry(mcResult) {
  const positions = mcResult.positions;
  const cells = mcResult.cells;
  if (!positions.length || !cells.length) throw new Error('SDF mesh empty');

  const flatPos = new Float32Array(positions.length * 3);
  for (let i = 0; i < positions.length; i++) {
    flatPos[i * 3] = positions[i][0];
    flatPos[i * 3 + 1] = positions[i][1];
    flatPos[i * 3 + 2] = positions[i][2];
  }

  const indices = new Uint32Array(cells.length * 3);
  for (let i = 0; i < cells.length; i++) {
    indices[i * 3] = cells[i][0];
    indices[i * 3 + 1] = cells[i][1];
    indices[i * 3 + 2] = cells[i][2];
  }

  let geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(flatPos, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom = mergeVertices(geom, 1e-4);
  return geom;
}

function addSculptureUvs(geom, maskOrigin) {
  const pos = geom.attributes.position;
  const spanX = maskOrigin.maxX - maskOrigin.minX || 1;
  const spanY = maskOrigin.maxY - maskOrigin.minY || 1;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) - maskOrigin.minX) / spanX;
    uvs[i * 2 + 1] = (maskOrigin.maxY - pos.getY(i)) / spanY;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/** Precomputed upward-biased hemisphere samples for cavity AO */
const AO_SAMPLE_DIRS = [
  [0, 0, 1],
  [0.22, 0, 0.975],
  [-0.22, 0, 0.975],
  [0, 0.22, 0.975],
  [0, -0.22, 0.975],
  [0.18, 0.18, 0.94],
  [-0.18, 0.18, 0.94],
  [0.18, -0.18, 0.94],
  [-0.18, -0.18, 0.94],
  [0.32, 0.08, 0.94],
  [-0.32, 0.08, 0.94],
  [0.08, 0.32, 0.94],
  [0.08, -0.32, 0.94],
  [0.28, 0.22, 0.88],
  [-0.28, 0.22, 0.88],
  [0.28, -0.22, 0.88],
  [-0.28, -0.22, 0.88],
  [0.42, 0, 0.86],
  [-0.42, 0, 0.86],
  [0, 0.42, 0.86]
];

/** Tiny hash for vertex grain on flat stone tops (disc fix). */
function aoGrainHash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function applySculptureVertexAO(geom, params) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const { maskScale, roundR, maxDistInScene } = params;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);

    let occ = 0;
    let weight = 0;
    for (const d of AO_SAMPLE_DIRS) {
      const dot = nx * d[0] + ny * d[1] + nz * d[2];
      if (dot < 0.08) continue;
      weight += dot;
      for (let step = 1; step <= 4; step++) {
        const t = step * roundR * 0.11;
        const sdf = stoneSdfAt(x + d[0] * t, y + d[1] * t, z + d[2] * t, params);
        if (sdf > -roundR * 0.04) {
          occ += dot / step;
          break;
        }
      }
    }

    const ao = weight > 0 ? Math.min(1, occ / weight) : 0;
    const px = (x - params.maskOrigin.minX) * maskScale;
    const py = (params.maskOrigin.maxY - y) * maskScale;
    let narrow = 0.5;
    if (params.segments?.length) {
      const tubeDist = nearestTubeDist(x, y, params.segments, params.segmentIndex);
      const coreR = params.roundR * 0.82;
      const valleyR = params.roundR * 2.15;
      if (tubeDist > coreR && tubeDist < valleyR) {
        const valleyT = (tubeDist - coreR) / Math.max(valleyR - coreR, 0.001);
        narrow = 0.12 + valleyT * 0.62;
      } else {
        narrow = Math.min(1, tubeDist / Math.max(params.roundR, 0.001));
      }
    } else if (params.embossSegments?.length) {
      const tubeDist = nearestTubeDist(
        x,
        y,
        params.embossSegments,
        params.embossSegmentIndex
      );
      narrow = Math.min(1, tubeDist / Math.max(roundR * 0.85, 0.001));
    } else if (params.engraveSegments?.length) {
      const tubeDist = nearestTubeDist(
        x,
        y,
        params.engraveSegments,
        params.engraveSegmentIndex
      );
      const tubeR = params.engraveTubeR ?? roundR * 0.35;
      narrow = Math.min(1, tubeDist / Math.max(tubeR * 0.95, 0.001));
    } else {
      const s = sampleMaskField(px, py, params);
      narrow =
        s.inside && maxDistInScene > 0
          ? 1 - Math.min(1, s.distIn / maskScale / (roundR * 1.05))
          : 0.5;
    }

    const cavity = ao * (params.slabMode ? 0.42 : 0.28) + narrow * (params.slabMode ? 0.16 : 0.12);
    const cavityT = Math.min(1, cavity);
    let lit = params.slabMode
      ? 0.5 + (1.0 - Math.pow(cavityT, 0.72) * 0.58) * 0.48
      : 0.88 + 0.12 * (1 - cavityT);
    lit = applyMetalContactShadow(lit, x, y, z, params);

    const carve = effectiveEngraveDepthAt(x, y, params);
    const bed = metalBedDepthAt(x, y, params);
    const baseZ = params.slabMode
      ? (params.basePlateHeight ?? params.maxH * 0.4)
      : params.maxH * 0.92;
    let grime = 0;
    if (carve > 0 && z < baseZ + carve * 0.15) {
      grime = Math.min(1, (baseZ + carve * 0.55 - z) / Math.max(carve * 0.72, 0.01));
      lit *= 1 - grime * (params.slabMode ? 0.28 : 0.22);
    } else if (bed > 0 && z < baseZ + bed * 0.35) {
      grime = Math.min(1, (baseZ + bed * 0.42 - z) / Math.max(bed * 0.78, 0.01));
      lit *= 1 - grime * 0.22;
    }

    const embossH = embossHeightAt(x, y, params);
    if (embossH > params.roundR * 0.08) {
      lit = Math.min(1, lit + Math.min(1, embossH / Math.max(params.embossHeight ?? params.roundR * 2, 0.01)) * 0.06);
    }

    if (params.embossOverlays?.length) {
      for (const ov of params.embossOverlays) {
        const px = (x - ov.maskOrigin.minX) * ov.maskScale;
        const py = (ov.maskOrigin.maxY - y) * ov.maskScale;
        const s = sampleMaskField(px, py, ov);
        if (!s.inside) continue;
        const din = s.distIn / ov.maskScale;
        const t = Math.min(1, din / Math.max(ov.maxDistInScene * 0.7, 0.01));
        lit = Math.min(1, lit + t * 0.12);
        break;
      }
    }

    const hiR = 0.98;
    const hiG = 0.99;
    const hiB = 0.97;
    const loR = 0.5;
    const loG = 0.52;
    const loB = 0.48;
    let r = loR + (hiR - loR) * lit;
    let g = loG + (hiG - loG) * lit;
    let b = loB + (hiB - loB) * lit;
    const flatTop = params.slabMode && nz > 0.84 && cavityT < 0.28 && carve < roundR * 0.03;
    if (flatTop) {
      const grain = (aoGrainHash(x * 41.7, y * 37.2) - 0.5) * 0.035;
      r = Math.max(0, Math.min(1, r + grain));
      g = Math.max(0, Math.min(1, g + grain * 0.98));
      b = Math.max(0, Math.min(1, b + grain * 0.96));
    }
    if (grime > 0) {
      const gmix = grime * 0.28;
      r = r * (1 - gmix) + 0.7 * gmix;
      g = g * (1 - gmix) + 0.72 * gmix;
      b = b * (1 - gmix) + 0.66 * gmix;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Soft contact shadow from L2 metal tubes onto stone beneath — geometry stays intact */
function applyMetalContactShadow(lit, x, y, z, params) {
  const { distToL2, maskScale, maskOrigin, maxH, w, h } = params;
  if (!distToL2) return lit;

  const mx = Math.round((x - maskOrigin.minX) * maskScale);
  const my = Math.round((maskOrigin.maxY - y) * maskScale);
  if (mx < 0 || mx >= w || my < 0 || my >= h) return lit;

  const distToMetal = distToL2[my * w + mx];
  const contact = Math.exp(-distToMetal / 18);
  const topWeight = Math.min(1, z / Math.max(maxH, 0.01));
  const shadowAmt = contact * (0.48 + 0.58 * topWeight);
  return lit * (1 - shadowAmt * 0.52);
}

/** Slab mode — metal contact shadow only (no full cavity AO), for vertexColors on stone material. */
function applySlabMetalContactColors(geom, params) {
  if (!params.distToL2) return;
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let lit = 1.0;
    lit = applyMetalContactShadow(lit, x, y, z, params);
    colors[i * 3] = 0.82 + 0.1 * lit;
    colors[i * 3 + 1] = 0.85 + 0.08 * lit;
    colors[i * 3 + 2] = 0.78 + 0.1 * lit;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * SVG silhouette mask → signed distance field → marching cubes → smoothed sculptural mesh.
 */
export function buildStoneSculptureMeshFromMask(
  grid,
  w,
  h,
  maskOrigin,
  tubeRadius,
  maskScale = 2,
  distToL2 = null,
  segments = null,
  options = null
) {
  const slabMode = !!options?.slabMode;
  const hasStrokeRelief =
    (options?.engraveSegments?.length || 0) +
      (options?.embossSegments?.length || 0) +
      (options?.embossDetailSegments?.length || 0) >
    0;
  const hasOverlays =
    (options?.engraveOverlays?.length || 0) + (options?.embossOverlays?.length || 0) > 0;
  const hasRelief = hasStrokeRelief || hasOverlays;
  const distIn = distanceTransform(grid, w, h);
  const distOut = distanceToMaskGrid(grid, w, h);

  let maxDistIn = 1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] && distIn[i] < 1e6) maxDistIn = Math.max(maxDistIn, distIn[i]);
  }

  const roundR = slabMode ? tubeRadius * 1.35 : tubeRadius * 1.02;
  const maxH = slabMode
    ? tubeRadius * (hasRelief ? 1.22 : 1.02)
    : segments?.length
      ? tubeRadius * 1.28
      : tubeRadius * 1.08;
  const maxDistInScene = maxDistIn / maskScale;
  const pad = roundR * 2.4;
  const segmentIndex =
    segments?.length > 0 ? buildSegmentSpatialIndex(segments, Math.max(roundR * 0.75, 2)) : null;

  const minX = maskOrigin.minX - pad;
  const maxX = maskOrigin.maxX + pad;
  const minY = maskOrigin.minY - pad;
  const maxY = maskOrigin.maxY + pad;
  const engraveExtra = options?.engraveDepth || 0;
  const minZ = -(roundR * 0.42 + engraveExtra * 0.9);
  let embossExtraH = Math.max(options?.embossHeight || 0, options?.embossDetailHeight || 0);
  for (const ov of options?.embossOverlays || []) {
    embossExtraH = Math.max(embossExtraH, ov.height || 0);
  }
  const maxZ = maxH + roundR * 0.55 + embossExtraH;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanY, spanZ);
  const res = Math.min(
    96,
    Math.max(60, Math.round(maxSpan / (roundR * (hasStrokeRelief ? 0.26 : 0.28))))
  );

  let nx = Math.max(40, Math.round(res * (spanX / maxSpan)));
  let ny = Math.max(40, Math.round(res * (spanY / maxSpan)));
  let nz = Math.max(
    hasStrokeRelief ? 56 : hasRelief ? 40 : 24,
    Math.round(res * (spanZ / maxSpan))
  );
  const maxVoxels = 220000;
  const voxels = nx * ny * nz;
  if (voxels > maxVoxels) {
    const s = Math.cbrt(maxVoxels / voxels);
    nx = Math.max(36, Math.round(nx * s));
    ny = Math.max(36, Math.round(ny * s));
    nz = Math.max(32, Math.round(nz * s));
  }

  const params = {
    grid,
    w,
    h,
    distIn,
    distOut,
    distToL2,
    segments,
    segmentIndex,
    maskOrigin,
    maskScale,
    roundR,
    maxH,
    maxDistInScene,
    slabMode,
    engraveSegments: options?.engraveSegments || null,
    embossSegments: options?.embossSegments || null,
    embossDetailSegments: options?.embossDetailSegments || null,
    engraveSegmentIndex:
      options?.engraveSegments?.length > 0
        ? buildSegmentSpatialIndex(options.engraveSegments, Math.max(roundR * 0.75, 2))
        : null,
    embossSegmentIndex:
      options?.embossSegments?.length > 0
        ? buildSegmentSpatialIndex(options.embossSegments, Math.max(roundR * 0.75, 2))
        : null,
    embossDetailSegmentIndex:
      options?.embossDetailSegments?.length > 0
        ? buildSegmentSpatialIndex(options.embossDetailSegments, Math.max(roundR * 0.75, 2))
        : null,
    engraveTubeR: options?.engraveTubeR ?? null,
    engraveDepth: options?.engraveDepth ?? null,
    engraveEmbossGap: options?.engraveEmbossGap ?? null,
    embossTubeR: options?.embossTubeR ?? null,
    embossHeight: options?.embossHeight ?? null,
    embossRipple: options?.embossRipple ?? 0,
    embossDetailTubeR: options?.embossDetailTubeR ?? null,
    embossDetailHeight: options?.embossDetailHeight ?? null,
    metalBedSegments: options?.metalBedSegments || null,
    metalBedSegmentIndex:
      options?.metalBedSegments?.length > 0
        ? buildSegmentSpatialIndex(options.metalBedSegments, Math.max(roundR * 0.75, 2))
        : null,
    metalBedTubeR: options?.metalBedTubeR ?? null,
    metalBedDepth: options?.metalBedDepth ?? null,
    metalBedShoulder: options?.metalBedShoulder ?? null,
    maxEngraveSinkFrac: options?.maxEngraveSinkFrac ?? 0.58,
    maxEngraveSink: options?.maxEngraveSink ?? null,
    basePlateHeight: options?.basePlateHeight ?? null,
    engraveOverlays: options?.engraveOverlays || null,
    embossOverlays: options?.embossOverlays || null,
    metalPlateCradle: options?.metalPlateCradle || null,
  };

  const potential = (x, y, z) => stoneSdfAt(x, y, z, params);
  const mc = marchingCubes(
    [nx, ny, nz],
    potential,
    [
      [minX, minY, minZ],
      [maxX, maxY, maxZ]
    ]
  );

  let geom = mcResultToGeometry(mc);
  const tubeMode = !!segments?.length && !slabMode;
  const smoothIter = slabMode ? (hasRelief ? 4 : 4) : tubeMode ? 6 : 8;
  const smoothLambda = slabMode
    ? hasStrokeRelief
      ? 0.11
      : hasOverlays
        ? 0.12
        : 0.2
    : tubeMode
      ? 0.22
      : 0.27;
  if (smoothIter > 0) laplacianSmoothGeometry(geom, smoothIter, smoothLambda);
  geom.computeVertexNormals();
  laplacianSmoothGeometry(geom, hasStrokeRelief ? 2 : 2, hasStrokeRelief ? 0.03 : tubeMode ? 0.08 : 0.05);
  geom.computeVertexNormals();
  // Slab stone: no vertex AO — mask-edge darkening looked like a silhouette outline and
  // washed out procedural grain on flat plateaus. Sculptural shading comes from lights + maps.
  if (!slabMode) applySculptureVertexAO(geom, params);
  addSculptureUvs(geom, maskOrigin);
  return geom;
}
